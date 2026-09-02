import type { QuickBriefResult } from "../../../lib/v2/types";
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

/** Strings planted in mocked error bodies that must never reach the page. */
export const LEAKED_STACK = "at callClaude (lib/claude.ts:221:9)";
export const LEAKED_PROMPT = "SYSTEM PROMPT MUST NOT LEAK";

export const OVERLOADED_MESSAGE =
  "The model provider is temporarily overloaded. Please try again in a moment.";
export const OVERLOADED_REQUEST_ID = "req_browser_overloaded_01";

export const retryableOverloadedError = {
  status: 503,
  headers: { "retry-after": "2" },
  body: {
    error: OVERLOADED_MESSAGE,
    code: "UPSTREAM_OVERLOADED",
    retryable: true,
    requestId: OVERLOADED_REQUEST_ID,
    // Never sent by the real server; proves unknown fields are ignored.
    internal: { stack: LEAKED_STACK, prompt: LEAKED_PROMPT }
  }
};

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
  }
];
