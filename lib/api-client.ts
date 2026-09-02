import { isAppErrorCode, type AppErrorCode } from "@/lib/errors";
import {
  ContractSchemaError,
  parseAgendaResponseValue,
  parseQuickBriefResultValue,
  parseRoundtableResultValue,
  type AgendaResponse
} from "@/lib/v2/contract-schema";
import type { QuickBriefDisplayResult } from "@/lib/v2/types";
import type { PanelMode, RoundtableResult } from "@/types";

export type { AgendaResponse };

/**
 * Browser-side view of the public error contract served by every API route:
 * `{ error, code, retryable, requestId? }`. Responses are untrusted input: a
 * body is accepted only when all three required fields have the right types,
 * and server-provided text is shown only for user-correctable validation
 * codes. Every other known code maps to fixed client copy, so internal detail
 * can never reach the page even if a future server message carried it.
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

/** Codes whose server message is written for the user and is shown verbatim. */
const validationCodes = [
  "INVALID_REQUEST",
  "INVALID_IDEA",
  "INVALID_AGENDA",
  "LIVE_MODE_DISABLED"
] as const satisfies readonly AppErrorCode[];

/** Fixed client copy for service-side failures. INTERNAL_ERROR uses the caller's fallback. */
export const serviceErrorMessages: Readonly<
  Record<Exclude<AppErrorCode, (typeof validationCodes)[number] | "INTERNAL_ERROR">, string>
> = {
  SERVICE_CONFIGURATION: "This server is not configured for live model execution.",
  UPSTREAM_AUTHENTICATION:
    "The AI service rejected the server's credentials. Live briefs are unavailable until the server configuration is fixed.",
  UPSTREAM_RATE_LIMIT: "The AI service is rate-limited right now. Please try again shortly.",
  UPSTREAM_TIMEOUT: "The AI service took too long to respond. Please try again.",
  UPSTREAM_OVERLOADED: "The AI service is temporarily overloaded. Please try again shortly.",
  UPSTREAM_FAILURE: "The AI service returned a temporary error. Please try again.",
  UPSTREAM_NETWORK: "The AI service could not be reached from the server. Please try again.",
  INVALID_MODEL_RESPONSE: "The AI service returned an unusable response. Please try again.",
  BUDGET_EXHAUSTED:
    "The request used its full model-call budget without a valid result. Please try again."
};

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

function messageFor(code: AppErrorCode, serverMessage: string, fallbackMessage: string): string {
  if ((validationCodes as readonly AppErrorCode[]).includes(code)) return serverMessage;
  if (code === "INTERNAL_ERROR") return fallbackMessage;
  return serviceErrorMessages[code as keyof typeof serviceErrorMessages];
}

/**
 * Parse an error body against the public contract. `error` must be non-empty
 * bounded text, `code` a known code, and `retryable` a boolean; otherwise the
 * whole body is treated as malformed. `requestId` is kept only when it looks
 * like an opaque identifier.
 */
export function parsePublicError(body: unknown, fallbackMessage: string): ClientError {
  if (!isRecord(body)) return malformedResponseError(fallbackMessage);

  const serverMessage = typeof body.error === "string" ? body.error.trim() : "";
  if (
    serverMessage.length === 0 ||
    serverMessage.length > MESSAGE_MAX_CHARACTERS ||
    !isAppErrorCode(body.code) ||
    typeof body.retryable !== "boolean"
  ) {
    return malformedResponseError(fallbackMessage);
  }

  const error: ClientError = {
    message: messageFor(body.code, serverMessage, fallbackMessage),
    code: body.code,
    retryable: body.retryable
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
 * A 2xx body is returned as `unknown`; callers must parse it before use.
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

/** Run a full contract parser over a 2xx body; any schema failure is a malformed response. */
function parseSuccess<T>(
  outcome: RequestOutcome<unknown>,
  parse: (value: unknown) => T,
  fallbackMessage: string
): RequestOutcome<T> {
  if (outcome.status !== "success") return outcome;
  try {
    return { status: "success", data: parse(outcome.data) };
  } catch (error) {
    if (error instanceof ContractSchemaError) {
      return { status: "error", error: malformedResponseError(fallbackMessage) };
    }
    throw error;
  }
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

export async function requestQuickBrief(
  body: QuickBriefRequestBody,
  signal?: AbortSignal
): Promise<RequestOutcome<QuickBriefDisplayResult>> {
  const outcome = await postJson("/api/brief", body, QUICK_BRIEF_FALLBACK_MESSAGE, signal);
  return parseSuccess(outcome, parseQuickBriefResultValue, QUICK_BRIEF_FALLBACK_MESSAGE);
}

export async function requestAgenda(
  body: { idea: string; panelMode: PanelMode },
  signal?: AbortSignal
): Promise<RequestOutcome<AgendaResponse>> {
  const outcome = await postJson("/api/agenda", body, AGENDA_FALLBACK_MESSAGE, signal);
  return parseSuccess(outcome, parseAgendaResponseValue, AGENDA_FALLBACK_MESSAGE);
}

export async function requestRoundtable(
  body: { idea: string; panelMode: PanelMode; topics: string[] },
  signal?: AbortSignal
): Promise<RequestOutcome<RoundtableResult>> {
  const outcome = await postJson("/api/roundtable", body, ROUNDTABLE_FALLBACK_MESSAGE, signal);
  return parseSuccess(outcome, parseRoundtableResultValue, ROUNDTABLE_FALLBACK_MESSAGE);
}
