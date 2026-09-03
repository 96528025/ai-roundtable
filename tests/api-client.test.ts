import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENDA_FALLBACK_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  QUICK_BRIEF_FALLBACK_MESSAGE,
  ROUNDTABLE_FALLBACK_MESSAGE,
  buildQuickBriefRequest,
  constraintsFromText,
  parsePublicError,
  postJson,
  requestAgenda,
  requestQuickBrief,
  requestRoundtable,
  serviceErrorMessages
} from "@/lib/api-client";
import { demoResult } from "@/lib/demo";
import { appErrorCodes } from "@/lib/errors";
import { demoQuickResult } from "@/lib/v2/demo";
import type { QuickBriefResult } from "@/lib/v2/types";
import { ideaBriefFixture, ideaFrameFixture } from "./v2-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const LEAKED = {
  stack: "Error: boom\n    at callClaude (lib/claude.ts:221:9)",
  prompt: "SYSTEM PROMPT MUST NOT LEAK",
  idea: "the user's private idea"
};

const fullQuickBriefResult: QuickBriefResult = {
  frame: ideaFrameFixture,
  planning: { status: "model" },
  route: { selectedPath: "quick", fullRoundtableRecommended: false, reasonCodes: ["default_quick_path"] },
  brief: ideaBriefFixture,
  budget: {
    maxCallAttempts: 4,
    usedCallAttempts: 2,
    retryAttempts: 0,
    maxRequestedOutputTokens: 8_400,
    requestedOutputTokens: 5_000
  },
  diagnostics: {
    runId: "run-1",
    startedAt: "2026-09-02T00:00:00.000Z",
    durationMs: 1_000,
    modelCallCount: 2,
    successfulModelCalls: 2,
    failedModelCalls: 0,
    retryCount: 0,
    inputTokens: 100,
    outputTokens: 50,
    models: ["test-model"]
  }
};

const malformedOutcome = (message: string) => ({
  status: "error",
  error: { message, code: "MALFORMED_RESPONSE", retryable: false }
});

describe("constraintsFromText", () => {
  it("splits lines, trims them, and drops blank lines", () => {
    expect(constraintsFromText("  One week  \n\n   \nMobile first\n")).toEqual([
      "One week",
      "Mobile first"
    ]);
  });

  it("accepts Windows line endings", () => {
    expect(constraintsFromText("A\r\nB\r\n")).toEqual(["A", "B"]);
  });

  it("returns an empty list for empty or whitespace-only input", () => {
    expect(constraintsFromText("")).toEqual([]);
    expect(constraintsFromText(" \n \n")).toEqual([]);
  });
});

describe("buildQuickBriefRequest", () => {
  it("omits a blank goal and keeps the idea verbatim", () => {
    expect(buildQuickBriefRequest(" idea ", "   ", "")).toEqual({
      idea: " idea ",
      goal: undefined,
      constraints: []
    });
    expect(JSON.parse(JSON.stringify(buildQuickBriefRequest("idea", "", "")))).toEqual({
      idea: "idea",
      constraints: []
    });
  });

  it("trims the goal and normalizes constraints", () => {
    expect(buildQuickBriefRequest("idea", "  Decide  ", " a \n\n b ")).toEqual({
      idea: "idea",
      goal: "Decide",
      constraints: ["a", "b"]
    });
  });
});

describe("parsePublicError", () => {
  it("shows server text for user-correctable validation codes", () => {
    for (const code of ["INVALID_REQUEST", "INVALID_IDEA", "INVALID_AGENDA", "LIVE_MODE_DISABLED"]) {
      expect(parsePublicError({ error: "Fix your input.", code, retryable: false }, "Fallback"))
        .toEqual({ message: "Fix your input.", code, retryable: false });
    }
  });

  it("replaces server text with fixed client copy for service-side codes", () => {
    for (const [code, message] of Object.entries(serviceErrorMessages)) {
      const parsed = parsePublicError(
        { error: `raw upstream detail for ${code}`, code, retryable: true, requestId: "req-1" },
        "Fallback"
      );
      expect(parsed).toEqual({ message, code, retryable: true, requestId: "req-1" });
      expect(parsed.message).not.toContain("raw upstream");
    }
  });

  it("uses the caller's fallback for INTERNAL_ERROR", () => {
    expect(
      parsePublicError({ error: "database password leaked", code: "INTERNAL_ERROR", retryable: false }, "Fallback")
    ).toEqual({ message: "Fallback", code: "INTERNAL_ERROR", retryable: false });
  });

  it("recognizes every server error code", () => {
    for (const code of appErrorCodes) {
      expect(parsePublicError({ error: "x", code, retryable: false }, "Fallback").code).toBe(code);
    }
  });

  it("keeps a retryable error's request ID and never carries unknown fields through", () => {
    const parsed = parsePublicError(
      {
        error: "Temporarily overloaded.",
        code: "UPSTREAM_OVERLOADED",
        retryable: true,
        requestId: "req_abc-123",
        stack: LEAKED.stack,
        prompt: LEAKED.prompt,
        details: { idea: LEAKED.idea }
      },
      "Fallback"
    );
    expect(parsed).toEqual({
      message: serviceErrorMessages.UPSTREAM_OVERLOADED,
      code: "UPSTREAM_OVERLOADED",
      retryable: true,
      requestId: "req_abc-123"
    });
    expect(JSON.stringify(parsed)).not.toContain("lib/claude.ts");
    expect(JSON.stringify(parsed)).not.toContain(LEAKED.prompt);
  });

  it("keeps a non-retryable error without inventing a request ID", () => {
    const parsed = parsePublicError(
      { error: "Bad agenda", code: "INVALID_AGENDA", retryable: false },
      "Fallback"
    );
    expect(parsed).toEqual({ message: "Bad agenda", code: "INVALID_AGENDA", retryable: false });
    expect("requestId" in parsed).toBe(false);
  });

  it("treats a missing or non-boolean retryable flag as a malformed body", () => {
    for (const retryable of ["true", 1, "yes", undefined, null, {}]) {
      expect(parsePublicError({ error: "x", code: "UPSTREAM_TIMEOUT", retryable }, "Fallback"))
        .toEqual({ message: "Fallback", code: "MALFORMED_RESPONSE", retryable: false });
    }
  });

  it("drops request IDs that do not look like opaque identifiers", () => {
    for (const requestId of ["", "has space", "line\nbreak", "x".repeat(129), 42, {}]) {
      const parsed = parsePublicError(
        { error: "x", code: "INVALID_IDEA", retryable: false, requestId },
        "Fallback"
      );
      expect(parsed.requestId).toBeUndefined();
      expect(parsed.message).toBe("x");
    }
  });

  it("falls back to the generic message when the code is unknown or missing", () => {
    for (const body of [
      { error: "x", retryable: true },
      { error: "x", code: "NOT_A_CODE", retryable: true },
      { error: "x", code: 500, retryable: true }
    ]) {
      expect(parsePublicError(body, "Fallback")).toEqual({
        message: "Fallback",
        code: "MALFORMED_RESPONSE",
        retryable: false
      });
    }
  });

  it("falls back when the message is missing, empty, non-text, or oversized", () => {
    for (const error of [undefined, "", "   ", 12, { message: "nested" }, "x".repeat(401)]) {
      expect(parsePublicError({ error, code: "INVALID_IDEA", retryable: false }, "Fallback"))
        .toEqual({ message: "Fallback", code: "MALFORMED_RESPONSE", retryable: false });
    }
  });

  it("falls back for non-object bodies", () => {
    for (const body of [null, undefined, "Bad Gateway", 503, [], true]) {
      expect(parsePublicError(body, "Fallback")).toEqual({
        message: "Fallback",
        code: "MALFORMED_RESPONSE",
        retryable: false
      });
    }
  });
});

describe("postJson", () => {
  it("sends a JSON body with the abort signal and returns the raw parsed data on success", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { ok: true }));
    const controller = new AbortController();

    await expect(postJson("/api/x", { a: 1 }, "Fallback", controller.signal)).resolves.toEqual({
      status: "success",
      data: { ok: true }
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
      signal: controller.signal
    });
  });

  it("maps a typed error body to the client error contract", async () => {
    stubFetch(
      jsonResponse(429, {
        error: "raw",
        code: "UPSTREAM_RATE_LIMIT",
        retryable: true,
        requestId: "req-1"
      })
    );

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({
      status: "error",
      error: {
        message: serviceErrorMessages.UPSTREAM_RATE_LIMIT,
        code: "UPSTREAM_RATE_LIMIT",
        retryable: true,
        requestId: "req-1"
      }
    });
  });

  it("turns a transport failure into a retryable NETWORK error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({
      status: "error",
      error: { message: NETWORK_ERROR_MESSAGE, code: "NETWORK", retryable: true }
    });
  });

  it("reports cancellation as aborted rather than as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"))
    );

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({ status: "aborted" });
  });

  it("reports an abort that happens while the body is being read", async () => {
    const response = {
      ok: true,
      json: () => Promise.reject(new DOMException("Aborted", "AbortError"))
    } as unknown as Response;
    stubFetch(response);

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({ status: "aborted" });
  });

  it("uses the generic message for non-JSON error bodies", async () => {
    stubFetch(
      new Response(`<html><pre>${LEAKED.stack}</pre></html>`, {
        status: 502,
        headers: { "content-type": "text/html" }
      })
    );

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual(
      malformedOutcome("Fallback")
    );
  });

  it("treats a 200 with a non-JSON body as malformed", async () => {
    stubFetch(new Response("not json", { status: 200 }));

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual(
      malformedOutcome("Fallback")
    );
  });
});

describe("requestQuickBrief", () => {
  it("accepts a full API result", async () => {
    stubFetch(jsonResponse(200, fullQuickBriefResult));
    await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual({
      status: "success",
      data: fullQuickBriefResult
    });
  });

  it("requires the budget and diagnostics the endpoint always reports", async () => {
    // The shipped sample is a display result without a run budget or diagnostics.
    for (const body of [
      demoQuickResult,
      { ...fullQuickBriefResult, budget: undefined },
      { ...fullQuickBriefResult, diagnostics: null }
    ]) {
      stubFetch(jsonResponse(200, body));
      await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual(
        malformedOutcome(QUICK_BRIEF_FALLBACK_MESSAGE)
      );
    }
  });

  it("enforces Quick Brief semantics: quick mode and no external research", async () => {
    const fullMode = structuredClone(fullQuickBriefResult);
    (fullMode.brief as { mode: string }).mode = "full";

    const researched = structuredClone(fullQuickBriefResult);
    (researched.brief.evidence as { status: string }).status = "limited";

    for (const body of [fullMode, researched]) {
      stubFetch(jsonResponse(200, body));
      await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual(
        malformedOutcome(QUICK_BRIEF_FALLBACK_MESSAGE)
      );
    }
  });

  it("rejects a 200 whose body fails deep contract validation", async () => {
    const withoutEvidenceStatus = structuredClone(fullQuickBriefResult) as unknown as {
      brief: { evidence: { status?: string } };
    };
    delete withoutEvidenceStatus.brief.evidence.status;

    const badVerdict = structuredClone(fullQuickBriefResult);
    (badVerdict.brief.verdict as { decision: string }).decision = "ship_it";

    const missingThreshold = structuredClone(fullQuickBriefResult) as unknown as {
      brief: { validationPlan7Days: Array<{ decisionThreshold?: string }> };
    };
    delete missingThreshold.brief.validationPlan7Days[0].decisionThreshold;

    const badDiagnostics = structuredClone(fullQuickBriefResult) as unknown as {
      diagnostics: { modelCallCount: unknown };
    };
    badDiagnostics.diagnostics.modelCallCount = "two";

    const badRoute = structuredClone(fullQuickBriefResult) as unknown as {
      route: { reasonCodes: unknown[] };
    };
    badRoute.route.reasonCodes = ["because"];

    const highConfidenceWithoutResearch = structuredClone(fullQuickBriefResult);
    (highConfidenceWithoutResearch.brief.verdict as { confidence: string }).confidence = "high";

    for (const body of [
      {},
      { brief: {} },
      [],
      "x",
      withoutEvidenceStatus,
      badVerdict,
      missingThreshold,
      badDiagnostics,
      badRoute,
      highConfidenceWithoutResearch
    ]) {
      stubFetch(jsonResponse(200, body));
      await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual(
        malformedOutcome(QUICK_BRIEF_FALLBACK_MESSAGE)
      );
    }
  });

  it("uses the Quick Brief fallback message for malformed error bodies", async () => {
    stubFetch(jsonResponse(500, { oops: true }));

    await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual(
      malformedOutcome(QUICK_BRIEF_FALLBACK_MESSAGE)
    );
  });

  it("posts to /api/brief", async () => {
    const fetchMock = stubFetch(jsonResponse(200, demoQuickResult));

    await requestQuickBrief({ idea: "an idea", goal: "g", constraints: ["c"] });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brief");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      idea: "an idea",
      goal: "g",
      constraints: ["c"]
    });
  });
});

describe("requestAgenda", () => {
  it("returns only the validated fields of a well-formed agenda", async () => {
    stubFetch(
      jsonResponse(200, {
        idea: "x",
        panelMode: "startup",
        topics: ["a", "b", "c"],
        diagnostics: fullQuickBriefResult.diagnostics
      })
    );

    await expect(requestAgenda({ idea: "x", panelMode: "startup" })).resolves.toEqual({
      status: "success",
      data: { idea: "x", panelMode: "startup", topics: ["a", "b", "c"] }
    });
  });

  it("rejects agendas with the wrong topic count, non-text topics, or an unknown panel", async () => {
    for (const body of [
      { idea: "x", panelMode: "startup", topics: ["a", "b"] },
      { idea: "x", panelMode: "startup", topics: ["a", "b", 3] },
      { idea: "x", panelMode: "startup", topics: "a,b,c" },
      { idea: "x", panelMode: "startup" },
      { idea: "x", topics: ["a", "b", "c"] },
      { idea: "x", panelMode: "board", topics: ["a", "b", "c"] }
    ]) {
      stubFetch(jsonResponse(200, body));
      await expect(requestAgenda({ idea: "x", panelMode: "startup" })).resolves.toEqual(
        malformedOutcome(AGENDA_FALLBACK_MESSAGE)
      );
    }
  });

  it("forwards the abort signal", async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, { idea: "x", panelMode: "startup", topics: ["a", "b", "c"] })
    );
    const controller = new AbortController();

    await requestAgenda({ idea: "x", panelMode: "startup" }, controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("requestRoundtable", () => {
  const body = { idea: "x", panelMode: "startup" as const, topics: ["a", "b", "c"] };

  it("accepts the shipped sample roundtable", async () => {
    stubFetch(jsonResponse(200, demoResult));

    await expect(requestRoundtable(body)).resolves.toEqual({
      status: "success",
      data: demoResult
    });
  });

  it("rejects results with an incomplete summary, a malformed or empty transcript, or no agenda", async () => {
    const missingSummaryField = structuredClone(demoResult) as unknown as {
      summary: { recommendedNextStep?: string };
    };
    delete missingSummaryField.summary.recommendedNextStep;

    const badTranscript = structuredClone(demoResult) as unknown as {
      transcript: unknown[];
    };
    badTranscript.transcript = [{ round: "one", agentName: "x", content: "y" }];

    for (const result of [
      missingSummaryField,
      badTranscript,
      { ...demoResult, agenda: [] },
      { ...demoResult, transcript: [] }
    ]) {
      stubFetch(jsonResponse(200, result));
      await expect(requestRoundtable(body)).resolves.toEqual(
        malformedOutcome(ROUNDTABLE_FALLBACK_MESSAGE)
      );
    }
  });

  it("forwards the abort signal", async () => {
    const fetchMock = stubFetch(jsonResponse(200, demoResult));
    const controller = new AbortController();

    await requestRoundtable(body, controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
