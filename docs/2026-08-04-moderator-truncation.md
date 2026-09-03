# Moderator synthesis failures — 40% of evaluation runs discarded

**Date:** 2026-08-04
**Status:** Fixed and re-measured
**Affected commit:** `199d6b6`
**Severity:** Every failure discarded fifteen successful, already-paid model calls — and the
surviving subset invited a quality conclusion that the corrected run did not reproduce.

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

## 3. Working diagnosis

`extractJsonObject` locates the report by scanning for the first `{` and the last `}`:

```ts
const start = raw.indexOf("{");
const end = raw.lastIndexOf("}");
if (start === -1 || end === -1 || end <= start) throw new AppError(...);
```

The summary schema is flat — one object, no nesting — so a response cut off mid-object
contains an opening brace and **no closing brace at all**. `end` is `-1` and the parse
throws.

Why might it have been cut off? The synthesis call was capped at `maxTokens: 1200`. A successful run
logged:

```json
{"stage":"moderator_synthesis","outputTokens":966,"durationMs":23327}
```

**966 against a ceiling of 1200 — 20% headroom.** The two failing cases had longer
transcripts (five agenda topics each, denser discussion), making a report that reached the
ceiling a plausible explanation for the missing closing brace.

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
Roughly doubles the headroom over the comparable observed 966-token output. This tests the
working diagnosis while reducing the likelihood of the same failure mode.

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

## 7. Re-measurement — and an unsupported conclusion the corrected run did not reproduce

The suite was re-run after the fix. **All five cases completed.**

| | Before (ceiling 1,200) | After (ceiling 2,000) |
| --- | --- | --- |
| Cases completed | 3 of 5 | **5 of 5** |
| Model calls per case | 16 | 16 |
| Resamples triggered | n/a | **0** |
| Transport retries | 0 | 0 |

**No case needed a resample.** The ceiling increase was the only recovery mechanism exercised
in the corrected run; the resample loop never fired and now sits as a backstop rather than a
crutch. The original failure did not reproduce, but without stop-reason data from that run
the truncation diagnosis remains circumstantial.

### The part that matters more than the bug

The three cases that survived the broken run produced a clean-looking negative result:
the roundtable scored **83.3** against the control's **100**, losing in two cases on the
same check, `next_step_actionability`. There was even a tidy mechanism available to explain
it — synthesising five hedged positions ought to yield a more qualified recommendation than
answering once.

**That conclusion was not supported by the complete re-run:**

| Case | Before | After | Control |
| --- | ---: | ---: | ---: |
| consultant workflow | 100 | 100 | 100 |
| local chef subscriptions | *crashed* | 100 | 100 |
| shopping decision brief | *crashed* | 100 | 100 |
| graduate program decision | **75** | **100** | 100 |
| campus event organizer | **75** | **100** | 100 |
| **Average** | **83.3** | **100** | **100** |

The two cases that scored 75 produced more concrete recommendations after the synthesis
ceiling was raised. That pattern is consistent with the moderator running out of room before
it could fit a concrete next step, but the failing run predates stop-reason logging, so the
causal explanation remains an inference rather than a directly observed fact.

The lesson is not merely "check your token limits." The failed cases and the suspicious
score gap shared the same circumstantial signature, and the score was the more dangerous
signal: a crash announces itself, while a plausible number does not. The 40% failure rate
was what forced a look at the configuration at all. Had only the three completed cases been
retained, the misleading conclusion could have survived with a tidy mechanism ready to
justify it.

### Corrected result

| Measure | Fixed roundtable | Single-pass control | Ratio |
| --- | ---: | ---: | ---: |
| Shared brief score (5 cases) | 100 | 100 | 0-point delta |
| Model calls per case | 16 | 1 | 16.0× |
| Total tokens | 183,189 | 4,831 | 37.9× |
| Total duration | 684.8 s | 97.5 s | 7.0× |
| Mean of the five paired per-case ratios | — | — | 38.1× tokens · 7.1× duration |

**Across these five cases the shared structural rubric did not distinguish the fixed roundtable from the single-pass control.** The fixed roundtable used 37.9× the tokens and 7.0× the time in aggregate; 38.1× and 7.1× are the means of the five paired per-case ratios.

The committed artifact records commit `8c353bb` with `"dirty": true`. Its uncommitted diff was not preserved, so the exact working tree cannot be reconstructed; treat these numbers as directional evidence rather than a cleanly reproducible benchmark.

## 8. What is still unproven

- **The truncation hypothesis was never directly confirmed.** `stop_reason` logging landed
  with the fix, so the failing run predates it, and the corrected run never truncated. The
  causal chain is inferred from the token arithmetic (966 observed against a 1,200 ceiling),
  from which cases failed, and from the gap closing when the ceiling rose. Consistent, but
  circumstantial. A deliberate reproduction at a 1,000-token ceiling would settle it.
- **The recovery rate of the resample is untested in production.** It has never fired
  outside `tests/synthesis.test.ts`.
- **The rubric saturates.** All ten runs scored 100. The evaluator can reject an unusable
  brief but cannot rank two adequate ones, so the tie means only that this structural
  rubric did not distinguish the two treatments in these five cases. Any broader quality
  comparison needs a discriminating rubric or blinded human review.
- **Five cases is still small,** and each was run once at non-zero temperature. Run-to-run
  variance has not been measured.

## 9. Follow-ups

- [x] Re-run `npm run eval` and confirm five recorded cases.
- [x] Update the paired-baseline table in `README.md` with the five-case numbers.
- [ ] Replace pass/fail checks with graded ones so the rubric can separate adequate from
      good — currently the binding limitation on every quality claim in this repo.
- [ ] Repeat each case two or three times to bound run-to-run variance.
- [ ] Persist per-turn state so a late failure resumes instead of restarting. The resample
      narrows this window but does not close it.
