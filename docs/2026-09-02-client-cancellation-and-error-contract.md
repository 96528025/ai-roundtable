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
- Validation codes (`INVALID_REQUEST`, `INVALID_IDEA`, `INVALID_AGENDA`,
  `LIVE_MODE_DISABLED`) show the server's text because it is written for the user
  and tells them what to change. Every other code maps to fixed client copy, so
  service-side detail can never reach the page even if a future server message
  carried it. `INTERNAL_ERROR` uses the calling flow's generic message.
- `requestId` is kept only if it looks like an opaque identifier and is shown in a
  quiet reference line together with the code.
- "Try again" is rendered only when `retryable` is `true`; it re-runs the same
  workflow with the current inputs. Any input change clears the error, so the
  inputs cannot drift from what the retry sends.
- Transport failures become a retryable `NETWORK` error; an aborted request is an
  `aborted` outcome and is never shown as an error.

### 2.3 Every 2xx body is parsed before it renders

`lib/v2/contract-schema.ts` holds pure parsers for the Quick Brief result, the
agenda response, and the roundtable result. They reference no environment,
credentials, or network code, so the module ships in the client bundle; the server
wraps the same parsers to validate model output, which keeps one definition of the
contract. A body that fails parsing becomes a `MALFORMED_RESPONSE` error before any
result component mounts. A class-based error boundary around result rendering is
the last resort: it renders the same notice and neither displays nor logs the
caught error.

### 2.4 Focus

Submitting moves focus to the progress region (`role="status"`), a result moves it
to the result region, an error moves it to the alert. Cancellation never moves
focus. Programmatic targets use `tabIndex={-1}` so they are not in the Tab order;
native controls keep their native keyboard behaviour. One `:focus-visible` ring is
shared by every interactive element and every programmatic target.

## 3. Test layers and what each one can claim

| Layer | Tool | Boundary |
| --- | --- | --- |
| Unit | Vitest | Parsers, code-to-message policy, request helpers with a stubbed `fetch`. |
| Browser integration | Playwright, Chromium only | Real production build of the page; every `/api/*` call is fulfilled by a route mock in the browser. Not end-to-end: the Next.js route handlers and model calls are not exercised. |
| Server guard | Playwright `APIRequestContext` | Bypasses page routing to prove the test server has no provider credentials and refuses model execution. |
| Accessibility scan | axe-core via `@axe-core/playwright` | Default rule set, no exclusions. Zero violations means no automatically detectable violations in the scanned state, not WCAG conformance. Colour-contrast checks axe cannot resolve (translucent panels over a gradient) are covered by `tests/contrast.test.ts`, which reads the palette from `globals.css`. |
| Fault injection | manual, five runs | Faults were injected one or two at a time and the suite re-run each time: removed cancellation; removed the identity check in the Quick Brief, agenda, and roundtable continuations; removed the synchronous in-flight guard; removed result focus; removed the retryable gate; removed the tablet reflow; forced a 700px action row. Each made the corresponding test fail. This is targeted fault injection, not systematic mutation testing. |

Provider access is disabled during deterministic tests: the Playwright web server
is started with an empty `ANTHROPIC_API_KEY`, route mocks answer every API call in
the browser, and the server-guard test confirms the refusal path. Browser-side
interception cannot observe server egress; the empty key and the guard test are
what make the claim credible.

## 4. Consequences

- Legacy flows (agenda, roundtable) now share the same cancellation and error
  handling as the Quick Brief, at the cost of one more ref each.
- The client bundle includes the contract parsers (a few kilobytes). Verified after
  a production build: no client chunk contains provider hostnames, header names,
  the key variable name, or the server observability code.
- The sample-only public deployment is unchanged: its server-side guard still
  rejects every model-backed route regardless of configured keys.
