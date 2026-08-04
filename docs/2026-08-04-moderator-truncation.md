# Moderator synthesis truncation — 40% of evaluation runs discarded

**Date:** 2026-08-04
**Status:** Fixed, pending re-measurement
**Affected commit:** `199d6b6`
**Severity:** Every failure discarded fifteen successful, already-paid model calls.

---

## 1. How it surfaced

The first full run of the paired evaluation suite (`npm run eval`, five cases) reported
**two failures out of five**:

```
Tests  2 failed | 3 passed (5)

FAIL  'local chef subscriptions' compares multi-agent and single-pass output
FAIL  'shopping decision brief'  compares multi-agent and single-pass output

AppError: The moderator returned an invalid report format.
  extractJsonObject      lib/debate.ts:209
  parseRoundtableSummary lib/debate.ts:220
  synthesizeSummary      lib/debate.ts:300
  runRoundtable          lib/debate.ts:331
```

Both failures were the same error at the same line. Because `outcomes.push()` runs only
after both systems complete, the two failed cases were absent from
`evals/results/latest.json`, which recorded `caseCount: 3` while `evals/cases.ts` defines
five. **The results file was silently incomplete** — a reader would not have known that
40% of the intended sample was missing without reading the terminal output.

## 2. What the failure actually cost

The roundtable makes sixteen sequential model calls: fifteen persona turns, then one
moderator synthesis. The failure happened on call sixteen.

From the diagnostics of a comparable successful run:

| | |
| --- | --- |
| Calls completed before the failure | 15 of 16 |
| Tokens spent before the failure | ~31,600 in / ~4,300 out |
| Wall-clock spent before the failure | ~130 s |
| Recovered | none |

The workflow has no intermediate persistence, so a failure at the last step throws away
everything earlier. **The cheapest call in the workflow was the one that could destroy it.**

## 3. Root cause

`extractJsonObject` locates the report by scanning for the first `{` and the last `}`:

```ts
const start = raw.indexOf("{");
const end = raw.lastIndexOf("}");
if (start === -1 || end === -1 || end <= start) throw new AppError(...);
```

The summary schema is flat — one object, no nesting — so a response cut off mid-object
contains an opening brace and **no closing brace at all**. `end` is `-1` and the parse
throws.

Why was it cut off? The synthesis call was capped at `maxTokens: 1200`. A successful run
logged:

```json
{"stage":"moderator_synthesis","outputTokens":966,"durationMs":23327}
```

**966 against a ceiling of 1200 — 20% headroom.** The two failing cases produced longer
transcripts (five agenda topics each, denser discussion), so their reports ran past the
ceiling and were truncated.

This was a hypothesis, not a fact, at the time of diagnosis: the code did not record
Anthropic's `stop_reason`, so there was no way to distinguish "model was cut off" from
"model wrote prose instead of JSON." Making that distinction observable is part of the fix.

## 4. The design gap this exposed

The retry policy before this change:

| Failure class | Retried? |
| --- | --- |
| Network error, timeout, `429`, `5xx`, `529` | Yes — up to 2, exponential backoff with jitter |
| Malformed model output | **No** |

The rule "retry transport failures, do not retry content failures" is a reasonable default:
if a model returns something unusable, asking again is often just paying twice for the same
mistake.

**The synthesis call is the exception, and the reason is arithmetic, not principle.**

- Resampling costs **1 call**.
- Not resampling costs **15 calls**.

At 15:1 odds, refusing to retry is the expensive choice. The original policy was applied
uniformly without asking what each individual failure actually costs.

## 5. Fix

Three changes, in the order they matter:

**1. Record `stop_reason`** (`lib/claude.ts`, `types.ts`)
Every model-call metric now carries Anthropic's stop reason. A truncated response logs
`"stopReason":"max_tokens"`, so the next occurrence is diagnosed from the logs rather than
inferred from token arithmetic. This changes nothing about behaviour; it makes the cause
observable.

**2. Raise the synthesis ceiling from 1,200 to 2,000 tokens** (`lib/debate.ts`)
Roughly doubles the headroom over the observed 966-token output. This addresses the actual
cause rather than the symptom.

**3. Resample the synthesis on an unparseable report** (`lib/debate.ts`)
Up to two additional attempts (`moderator_synthesis.resample_1`, `resample_2`) before the
workflow fails.

### Decisions taken inside the fix

**The resample is identical — same messages, same temperature, same ceiling.**
The alternative was to append a corrective instruction ("return only JSON, no preamble") on
retry. That would likely raise the recovery rate, but it makes the retry a *different
treatment* rather than a second draw from the same distribution. For a project whose
purpose is measuring this system honestly, a recovered run must remain comparable to a
first-attempt run. Recovery rate was traded for measurement integrity.

**Only the synthesis call resamples; persona turns do not.**
A failed persona turn discards one call, not fifteen. The 15:1 argument does not apply, so
the general policy stands. Scope the exception to the case that earns it.

**Attempts are bounded at three and the last error is rethrown.**
An unbounded retry against a systematically malformed prompt would spend real money in a
loop. Three attempts is enough to absorb sampling noise and small enough to fail fast if
the report format is genuinely broken.

**Transport retries and content resamples are counted separately.**
`retryCount` in diagnostics counts HTTP-level retries within one `callClaude`. A resample
is a new call with its own stage label. They are different failure classes and conflating
them would hide which one occurred.

## 6. Verification

`tests/synthesis.test.ts` drives the full sixteen-call workflow against a stubbed
Anthropic endpoint:

| Test | Asserts |
| --- | --- |
| recovers a completed roundtable when the first report is truncated | Synthesis returns a `max_tokens`-truncated body, the resample returns a valid report; the workflow completes with all 15 turns intact and 17 total calls |
| records the truncation signal so the cause is visible in diagnostics | Stages are exactly `moderator_synthesis` then `moderator_synthesis.resample_1`; stop reasons are `max_tokens` then `end_turn` |
| gives up after a bounded number of resamples | Three consecutive unusable reports produce exactly 18 calls and the original error |

These are regression tests, not smoke tests: with `MODERATOR_PARSE_ATTEMPTS` set back to
`1`, all three fail.

Full suite after the change: **26 passed, 5 skipped** (`npm test`), plus `typecheck`,
`lint`, and `build` clean.

## 7. What is still unproven

- **The truncation hypothesis has not been confirmed on live traffic.** It is consistent
  with the token arithmetic and with which cases failed, but the run that produced the
  failures predates `stop_reason` logging. The next live evaluation will either show
  `"stopReason":"max_tokens"` on a resampled call or show that the cause was something else.
- **The recovery rate is unknown.** The tests prove the mechanism works; they do not
  predict how often one resample is sufficient in practice.
- **The measured comparison is still based on three cases.** The negative result recorded
  in `evals/results/latest.json` (multi-agent 83.3 vs single-pass 100 on the shared brief
  rubric) came from the three cases that completed. It must be re-run at five cases before
  any claim rests on it.

## 8. Follow-ups

- [ ] Re-run `npm run eval` and confirm five recorded cases.
- [ ] Check the new run for `"stopReason":"max_tokens"` to confirm or reject section 3.
- [ ] Update the paired-baseline table in `README.md` with the five-case numbers.
- [ ] Consider persisting per-turn state so a late failure resumes instead of restarting —
      the resample narrows this window but does not close it. Currently listed under
      *Future Improvements*.

---

## Appendix: the broader finding this run produced

Separate from the reliability bug, the three completed cases showed the multi-agent
workflow scoring **lower** than a single-call control on the shared brief rubric:

| Case | Multi-agent | Single-pass | Δ |
| --- | ---: | ---: | ---: |
| consultant workflow | 100 | 100 | 0 |
| graduate program decision | 75 | 100 | −25 |
| campus event organizer | 75 | 100 | −25 |
| **Average** | **83.3** | **100** | **−16.7** |

Cost of the losing configuration: **38.1× tokens, 6.9× wall-clock, 16× model calls.**

All three multi-agent losses came from the same check, `next_step_actionability`, which
requires the recommended next step to contain both an action and a numeric or time-bound
constraint. The single-pass control passed that check in all three cases; the roundtable
failed it in two.

A plausible reading — not yet tested — is that synthesising five hedged positions produces
a more qualified recommendation than answering the question once. That is a hypothesis
about the architecture, and confirming it needs the five-case run plus a look at the actual
wording of the failing next steps.
