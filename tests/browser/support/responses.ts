import { demoResult } from "../../../lib/demo";
import {
  normalizeRoundtableAgenda,
  PANEL_AGENT_NAMES,
  ROUNDTABLE_ROUNDS
} from "../../../lib/roundtable-contract";
import type { QuickBriefResult } from "../../../lib/v2/types";
import type { PanelMode, RoundtableResult } from "../../../types";
import { ideaBriefFixture, ideaFrameFixture } from "../../v2-fixtures";

/**
 * A complete /api/brief success body assembled from the existing unit-test
 * fixtures. It intentionally differs from the in-app sample (`demoQuickResult`)
 * so tests can tell a live result apart from the sample result by content.
 */
export const quickBriefResult: QuickBriefResult = {
  frame: ideaFrameFixture,
  planning: { status: "model" },
  route: {
    selectedPath: "quick",
    fullRoundtableRecommended: false,
    reasonCodes: ["default_quick_path"]
  },
  brief: ideaBriefFixture,
  budget: {
    maxCallAttempts: 4,
    usedCallAttempts: 2,
    retryAttempts: 0,
    maxRequestedOutputTokens: 8_400,
    requestedOutputTokens: 5_000
  },
  diagnostics: {
    runId: "run-browser-test",
    startedAt: "2026-09-02T00:00:00.000Z",
    durationMs: 1_234,
    modelCallCount: 2,
    successfulModelCalls: 2,
    failedModelCalls: 0,
    retryCount: 0,
    inputTokens: 1_000,
    outputTokens: 800,
    models: ["mock-model"]
  }
};

/** Text that appears only in the live fixture, never in the sample result. */
export const LIVE_RESULT_MARKER = "A browser-based comparison assistant";

/** A /api/agenda success body for the given idea; extra fields mirror the real route. */
export function agendaResponseFor(idea: string) {
  return {
    idea,
    panelMode: "startup",
    topics: [
      "Demand and the current comparison workaround",
      "Smallest testable comparison MVP",
      "Trust in extracted product data"
    ],
    diagnostics: quickBriefResult.diagnostics
  };
}

/** Build a complete /api/roundtable success body whose request echoes match. */
export function roundtableResponseFor(
  topics: readonly string[],
  panelMode: PanelMode = "startup"
): RoundtableResult {
  const agentNames = PANEL_AGENT_NAMES[panelMode];
  return {
    ...demoResult,
    agenda: normalizeRoundtableAgenda(topics),
    panelMode,
    transcript: ROUNDTABLE_ROUNDS.flatMap((round) =>
      agentNames.map((agentName, index) => ({
        round,
        agentName,
        content: demoResult.transcript[(round - 1) * agentNames.length + index].content
      }))
    ),
    diagnostics: quickBriefResult.diagnostics
  };
}

/** Strings planted in mocked error bodies that must never reach the page. */
export const LEAKED_STACK = "at callClaude (lib/claude.ts:221:9)";
export const LEAKED_PROMPT = "SYSTEM PROMPT MUST NOT LEAK";

/** Raw server text for a service-side code. The client must replace it with its own copy. */
export const SERVER_OVERLOADED_TEXT =
  "overloaded_error 529 from provider (raw upstream text that must not be shown)";
export const CLIENT_OVERLOADED_MESSAGE =
  "The AI service is temporarily overloaded. Please try again shortly.";
export const OVERLOADED_REQUEST_ID = "req_browser_overloaded_01";

export const retryableOverloadedError = {
  status: 503,
  headers: { "retry-after": "2" },
  body: {
    error: SERVER_OVERLOADED_TEXT,
    code: "UPSTREAM_OVERLOADED",
    retryable: true,
    requestId: OVERLOADED_REQUEST_ID,
    // Never sent by the real server; proves unknown fields are ignored.
    internal: { stack: LEAKED_STACK, prompt: LEAKED_PROMPT }
  }
};

/** Validation codes are user-correctable, so their server text is shown verbatim. */
export const INVALID_REQUEST_MESSAGE = "Provide no more than 5 constraints.";

export const nonRetryableInvalidRequestError = {
  status: 400,
  body: {
    error: INVALID_REQUEST_MESSAGE,
    code: "INVALID_REQUEST",
    retryable: false,
    internal: { stack: LEAKED_STACK, prompt: LEAKED_PROMPT }
  }
};

export const GENERIC_FALLBACK_MESSAGE = "The Quick Brief could not be completed.";

export const malformedErrorResponses = [
  {
    name: "HTML body from an intermediary",
    status: 502,
    contentType: "text/html",
    body: `<html><body><h1>Bad Gateway</h1><pre>${LEAKED_STACK}</pre></body></html>`
  },
  {
    name: "JSON body that ignores the contract",
    status: 500,
    body: {
      error: { message: "boom", stack: LEAKED_STACK },
      prompt: LEAKED_PROMPT
    }
  },
  {
    name: "contract fields with the wrong types",
    status: 500,
    body: { error: LEAKED_STACK.repeat(20), code: "NOT_A_CODE", retryable: "yes" }
  },
  {
    name: "contract body missing the retryable flag",
    status: 503,
    body: { error: SERVER_OVERLOADED_TEXT, code: "UPSTREAM_OVERLOADED" }
  }
];

/** A 200 body that passes shallow checks but fails full contract validation. */
export function malformedSuccessBody(): unknown {
  const body = structuredClone(quickBriefResult) as { brief: { evidence: { status?: string } } };
  delete body.brief.evidence.status;
  return body;
}
