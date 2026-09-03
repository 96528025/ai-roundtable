# Client-side cancellation, response validation, and the error contract

**Date:** 2026-09-02
**Status:** Implemented on the Quick Brief, agenda, and roundtable flows
**Scope:** browser code in `app/`, the shared parsers in `lib/v2/contract-schema.ts`, and the test layers that verify them

---

## 1. Problem

The page runs three asynchronous workflows against three API routes. Before this
change the client:

- kept the loading flag, result, and error in plain React state with no notion of
  *which* request a response belonged to, so a slow response could overwrite state
  that a later user action had already replaced (switching to the sample, choosing
  an example idea, editing the idea, changing the advisory panel, editing topics);
- read `data.error` from a failed response and discarded `code`, `retryable`, and
  `requestId`, so the UI could not offer a retry action or a support reference;
- rendered any 2xx body as if it matched the TypeScript type, so a wrong-shaped
  body would crash the render.

## 2. Decisions

### 2.1 One request identity per workflow

Each workflow owns a `useRef<AbortController | null>`. Starting a request creates a
fresh controller and stores it in the ref. That controller *is* the request's
identity:

- After every `await`, the continuation checks `ref.current === controller` before
  touching any state (loading, result, failure, focus target). A mismatch returns
  immediately. There is no unconditional `finally` that clears loading.
- Cancelling sets the ref to `null` first, then calls `abort()`, then clears the
  loading flag. Ordering matters: by the time the aborted fetch rejects, the
  continuation already sees itself as stale.
- Starting any workflow checks all three refs synchronously, so two activations in
  the same event-loop tick cannot start two requests. The `disabled` attributes on
  buttons are a UI affordance, not the guard.
- On unmount every ref is invalidated before any controller is aborted.

Invalidation matrix:

| User action | Quick Brief | Agenda | Roundtable |
| --- | --- | --- | --- |
| Edit idea / goal / constraints, choose example, View sample | cancel | cancel | cancel |
| Change advisory panel | keep | cancel | cancel |
| Edit, add, or remove an agenda topic | keep | keep | cancel |

`AbortController` is the transport-level half of the mechanism; the identity check
is the state-level half. Tests cover them separately: one set proves the request is
aborted (`net::ERR_ABORTED`), another strips the abort signal from `fetch` for the
target route so the stale response really reaches application code and the
identity check alone has to discard it.

What this does **not** do: a cancelled browser request does not stop work the server
has already started. Model calls that are in flight on the server complete and are
billed as usual. Cancellation protects UI state; it does not save tokens.

### 2.2 Error contract in the browser

Every API route already returned `{ error, code, retryable, requestId? }`. The
client now parses that body as untrusted input (`lib/api-client.ts`):

- All three required fields must have the right types; otherwise the body is
  treated as malformed and the user sees a fixed generic message with the code
  `MALFORMED_RESPONSE`, non-retryable.
- `code` must be one of the server's declared codes. The list lives once, as a
  runtime constant in `lib/errors.ts`, and the type is derived from it.
- Input-validation codes (`INVALID_REQUEST`, `INVALID_IDEA`, `INVALID_AGENDA`)
  show the server's bounded text because it tells the user what to change. Every
  other service-side code, including `LIVE_MODE_DISABLED`, maps to fixed client
  copy, so service-side detail cannot reach the page even if a future server
  message carries it. `INTERNAL_ERROR` uses the calling flow's generic message.
- `requestId` is kept only if it looks like an opaque identifier and is shown in a
  quiet reference line together with the code.
- "Try again" is rendered only when `retryable` is `true`; it re-runs the same
  workflow with the current inputs. Any input change clears the error, so the
  inputs cannot drift from what the retry sends.
- Transport failures become a retryable `NETWORK` error; an aborted request is an
  `aborted` outcome and is never shown as an error.

### 2.3 Every 2xx body is parsed before it renders

`lib/v2/contract-schema.ts` holds pure parsers for the Quick Brief result, agenda
response, and roundtable result. They reference no environment, credentials, or
network code, so the module ships in the client bundle. The server-side Quick
writer parser and browser-side `/api/brief` response parser use the same semantic
validator for the nested brief: `mode` must be `quick` and `evidence.status` must
be `not_researched`, which in turn forbids sources, evidence claims, and high
confidence. The endpoint response parser also requires the budget and diagnostics
the endpoint always reports.

The legacy endpoint parsers bind successful responses to their request snapshots:

- Agenda responses are deeply parsed, then must echo the trimmed request idea and
  selected panel mode.
- Roundtable responses must echo the request agenda after the same trimming,
  blank-removal, and stable de-duplication used by the server, preserve its order,
  echo the selected panel mode, and include diagnostics.
- The fixed transcript is checked against client-safe shared constants: three
  rounds and the selected panel's five public agent names, in the same
  round-and-agent order executed by the server.
- The moderator's structured summary uses the same pure field, size, and list
  parser before the server returns it and before the browser renders it.

Separate display parsers accept shipped samples that have no run diagnostics. A
body that fails its endpoint parser becomes a `MALFORMED_RESPONSE` error before
any result component mounts.

A class-based error boundary around result rendering is the last resort: it
renders the same notice, moves focus to it on either an initial-mount or later
render failure, and neither displays nor logs the caught error. The owner keys the
boundary by result epoch, so setting a new result creates a fresh boundary even
when the same sample object is shown again. Permanent browser regression tests
inject scoped render faults at the browser boundary, without a production test
hook, and verify safe copy, fallback focus, same-sample recovery, result focus,
and isolation between result surfaces.

### 2.4 Focus

Submitting a Quick Brief moves focus to its progress region (`role="status"`);
the Quick result and View sample action move focus to the Quick result region.
Request errors move focus to the alert. Cancellation never moves focus. A pending
result focus normally clears after its target mounts, which also covers recovery
from the result boundary; input invalidation or switching to a legacy workflow
retires that intent without moving focus. Programmatic targets use
`tabIndex={-1}` so they are not in the Tab order; native controls keep their native
keyboard behaviour. One `:focus-visible` ring is shared by every interactive
element and every programmatic target.

## 3. Test layers and what each one can claim

| Layer | Tool | Boundary |
| --- | --- | --- |
| Unit | Vitest | Parsers, code-to-message policy, request helpers with a stubbed `fetch`. |
| Browser integration | Playwright, Chromium only | Real production build of the page; every page-originated `/api/*` call is fulfilled by a route mock in the browser. Not end-to-end: the Next.js route handlers and model calls are not exercised. |
| Server guard | Playwright `APIRequestContext` | Bypasses page routing to prove the test server has no provider credentials and refuses model execution. |
| Accessibility scan | axe-core via `@axe-core/playwright` | Default rule set, no exclusions. Zero violations means no automatically detectable violations in the scanned state, not WCAG conformance. Every scan leaves one `color-contrast` rule as "needs review" (translucent panels over a gradient); `tests/contrast.test.ts` verifies representative palette combinations read from `globals.css`, not axe's individual nodes. |
| Fault injection | targeted local runs | Faults were injected one or two at a time and the suite re-run each time: removed cancellation; removed the identity check in the Quick Brief, agenda, and roundtable continuations; removed the synchronous in-flight guard; removed result focus; removed the retryable gate; removed the tablet reflow; forced a 700px action row. Each made the corresponding test fail. This is targeted fault injection, not systematic mutation testing. |

Provider access is disabled during deterministic tests: the Playwright web server
is started with an empty `ANTHROPIC_API_KEY`, route mocks answer every page-originated
API call in the browser, and the server-guard test confirms the refusal path. Browser-side
interception cannot observe server egress; the empty key and the guard test are
what make the claim credible.

## 4. Consequences

- Legacy flows (agenda, roundtable) now share the same cancellation and error
  handling as the Quick Brief, at the cost of one more ref each.
- The client bundle includes the pure contract parsers. Verified after a production
  build: no client chunk contains provider hostnames, header names,
  the key variable name, or the server observability code.
- The sample-mode server guard is unchanged in this code: it rejects every
  model-backed route regardless of configured keys.
