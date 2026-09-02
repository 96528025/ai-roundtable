import { isAppErrorCode, type AppErrorCode } from "@/lib/errors";
import type { QuickBriefDisplayResult } from "@/lib/v2/types";
import type { PanelMode, RoundtableResult } from "@/types";

/**
 * Browser-side view of the public error contract served by every API route:
 * `{ error, code, retryable, requestId? }`. Responses are untrusted input, so
 * anything that does not match the contract collapses into a generic, safe
 * message. Two client-only codes cover failures that never reach the server
 * contract at all.
 */
export type ClientErrorCode = AppErrorCode | "NETWORK" | "MALFORMED_RESPONSE";

export type ClientError = {
  message: string;
  code: ClientErrorCode;
  retryable: boolean;
  requestId?: string;
};

export type RequestOutcome<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: ClientError }
  | { status: "aborted" };

export const QUICK_BRIEF_FALLBACK_MESSAGE = "The Quick Brief could not be completed.";
export const AGENDA_FALLBACK_MESSAGE = "The Full Roundtable agenda could not be prepared.";
export const ROUNDTABLE_FALLBACK_MESSAGE = "The Full Roundtable could not finish.";
export const NETWORK_ERROR_MESSAGE =
  "The server could not be reached. Check your connection and try again.";

const MESSAGE_MAX_CHARACTERS = 400;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(reason: unknown): boolean {
  return isRecord(reason) && reason.name === "AbortError";
}

export function malformedResponseError(fallbackMessage: string): ClientError {
  return { message: fallbackMessage, code: "MALFORMED_RESPONSE", retryable: false };
}

/**
 * Parse an error body against the public contract. Only a non-empty, bounded
 * `error` string paired with a known `code` is trusted; everything else falls
 * back to the caller's generic message. `retryable` must be literally `true`,
 * and `requestId` is kept only when it looks like an opaque identifier.
 */
export function parsePublicError(body: unknown, fallbackMessage: string): ClientError {
  if (!isRecord(body)) return malformedResponseError(fallbackMessage);

  const message = typeof body.error === "string" ? body.error.trim() : "";
  if (
    message.length === 0 ||
    message.length > MESSAGE_MAX_CHARACTERS ||
    !isAppErrorCode(body.code)
  ) {
    return malformedResponseError(fallbackMessage);
  }

  const error: ClientError = {
    message,
    code: body.code,
    retryable: body.retryable === true
  };
  if (typeof body.requestId === "string" && REQUEST_ID_PATTERN.test(body.requestId)) {
    error.requestId = body.requestId;
  }
  return error;
}

/**
 * POST JSON and classify the outcome. Never throws: transport failures become
 * a retryable NETWORK error, cancellation becomes `aborted`, and any body that
 * cannot be read as JSON becomes a non-retryable MALFORMED_RESPONSE error.
 */
export async function postJson(
  url: string,
  body: unknown,
  fallbackMessage: string,
  signal?: AbortSignal
): Promise<RequestOutcome<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
  } catch (reason) {
    if (isAbortError(reason)) return { status: "aborted" };
    return {
      status: "error",
      error: { message: NETWORK_ERROR_MESSAGE, code: "NETWORK", retryable: true }
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (reason) {
    if (isAbortError(reason)) return { status: "aborted" };
    return { status: "error", error: malformedResponseError(fallbackMessage) };
  }

  if (!response.ok) {
    return { status: "error", error: parsePublicError(data, fallbackMessage) };
  }
  return { status: "success", data };
}

export function constraintsFromText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((constraint) => constraint.trim())
    .filter(Boolean);
}

export type QuickBriefRequestBody = {
  idea: string;
  goal?: string;
  constraints: string[];
};

export function buildQuickBriefRequest(
  idea: string,
  goal: string,
  constraintsText: string
): QuickBriefRequestBody {
  return {
    idea,
    goal: goal.trim() || undefined,
    constraints: constraintsFromText(constraintsText)
  };
}

/**
 * Shallow shape check for a successful Quick Brief body. The server validates
 * the full contract before responding; this only guards the sections the UI
 * dereferences immediately so a wrong-shaped body degrades to an error state
 * instead of a crashed render.
 */
export function isQuickBriefDisplayResult(value: unknown): value is QuickBriefDisplayResult {
  if (!isRecord(value)) return false;
  const { frame, planning, route, brief } = value;
  return (
    isRecord(frame) &&
    Array.isArray(frame.unknowns) &&
    isRecord(planning) &&
    isRecord(route) &&
    isRecord(brief) &&
    isRecord(brief.verdict) &&
    typeof brief.verdict.decision === "string" &&
    Array.isArray(brief.verdict.flags) &&
    isRecord(brief.evidence) &&
    isRecord(brief.recommendedMvp) &&
    isRecord(brief.technicalApproach) &&
    Array.isArray(brief.validationPlan7Days)
  );
}

export async function requestQuickBrief(
  body: QuickBriefRequestBody,
  signal?: AbortSignal
): Promise<RequestOutcome<QuickBriefDisplayResult>> {
  const outcome = await postJson("/api/brief", body, QUICK_BRIEF_FALLBACK_MESSAGE, signal);
  if (outcome.status !== "success") return outcome;
  if (!isQuickBriefDisplayResult(outcome.data)) {
    return { status: "error", error: malformedResponseError(QUICK_BRIEF_FALLBACK_MESSAGE) };
  }
  return { status: "success", data: outcome.data };
}

export type AgendaResponse = { idea: string; topics: string[] };

function isAgendaResponse(value: unknown): value is AgendaResponse {
  return (
    isRecord(value) &&
    typeof value.idea === "string" &&
    Array.isArray(value.topics) &&
    value.topics.every((topic) => typeof topic === "string")
  );
}

export async function requestAgenda(
  body: { idea: string; panelMode: PanelMode }
): Promise<RequestOutcome<AgendaResponse>> {
  const outcome = await postJson("/api/agenda", body, AGENDA_FALLBACK_MESSAGE);
  if (outcome.status !== "success") return outcome;
  if (!isAgendaResponse(outcome.data)) {
    return { status: "error", error: malformedResponseError(AGENDA_FALLBACK_MESSAGE) };
  }
  return { status: "success", data: outcome.data };
}

function isRoundtableResult(value: unknown): value is RoundtableResult {
  return (
    isRecord(value) &&
    Array.isArray(value.agenda) &&
    typeof value.panelMode === "string" &&
    isRecord(value.summary) &&
    Array.isArray(value.transcript)
  );
}

export async function requestRoundtable(
  body: { idea: string; panelMode: PanelMode; topics: string[] }
): Promise<RequestOutcome<RoundtableResult>> {
  const outcome = await postJson("/api/roundtable", body, ROUNDTABLE_FALLBACK_MESSAGE);
  if (outcome.status !== "success") return outcome;
  if (!isRoundtableResult(outcome.data)) {
    return { status: "error", error: malformedResponseError(ROUNDTABLE_FALLBACK_MESSAGE) };
  }
  return { status: "success", data: outcome.data };
}
