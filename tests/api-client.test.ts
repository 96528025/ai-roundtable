import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENDA_FALLBACK_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  QUICK_BRIEF_FALLBACK_MESSAGE,
  buildQuickBriefRequest,
  constraintsFromText,
  isQuickBriefDisplayResult,
  parsePublicError,
  postJson,
  requestAgenda,
  requestQuickBrief
} from "@/lib/api-client";
import { appErrorCodes } from "@/lib/errors";
import { demoQuickResult } from "@/lib/v2/demo";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const LEAKED = {
  stack: "Error: boom\n    at callClaude (lib/claude.ts:221:9)",
  prompt: "SYSTEM PROMPT MUST NOT LEAK",
  idea: "the user's private idea"
};

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
  it("keeps a retryable typed error including its request ID", () => {
    expect(
      parsePublicError(
        {
          error: "Temporarily overloaded.",
          code: "UPSTREAM_OVERLOADED",
          retryable: true,
          requestId: "req_abc-123"
        },
        "Fallback"
      )
    ).toEqual({
      message: "Temporarily overloaded.",
      code: "UPSTREAM_OVERLOADED",
      retryable: true,
      requestId: "req_abc-123"
    });
  });

  it("keeps a non-retryable typed error without inventing a request ID", () => {
    const parsed = parsePublicError(
      { error: "Bad agenda", code: "INVALID_AGENDA", retryable: false },
      "Fallback"
    );
    expect(parsed).toEqual({ message: "Bad agenda", code: "INVALID_AGENDA", retryable: false });
    expect("requestId" in parsed).toBe(false);
  });

  it("recognizes every server error code", () => {
    for (const code of appErrorCodes) {
      expect(parsePublicError({ error: "x", code, retryable: false }, "Fallback").code).toBe(code);
    }
  });

  it("never carries unknown fields such as stacks or prompts through", () => {
    const parsed = parsePublicError(
      {
        error: "Safe message",
        code: "INTERNAL_ERROR",
        retryable: false,
        stack: LEAKED.stack,
        prompt: LEAKED.prompt,
        details: { idea: LEAKED.idea }
      },
      "Fallback"
    );
    expect(parsed).toEqual({ message: "Safe message", code: "INTERNAL_ERROR", retryable: false });
    expect(JSON.stringify(parsed)).not.toContain("lib/claude.ts");
    expect(JSON.stringify(parsed)).not.toContain(LEAKED.prompt);
  });

  it("treats anything but a literal true as non-retryable", () => {
    for (const retryable of ["true", 1, "yes", undefined, null, {}]) {
      expect(
        parsePublicError({ error: "x", code: "UPSTREAM_TIMEOUT", retryable }, "Fallback")
          .retryable
      ).toBe(false);
    }
  });

  it("drops request IDs that do not look like opaque identifiers", () => {
    for (const requestId of ["", "has space", "line\nbreak", "x".repeat(129), 42, {}]) {
      const parsed = parsePublicError(
        { error: "x", code: "UPSTREAM_FAILURE", retryable: true, requestId },
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
      expect(parsePublicError({ error, code: "INTERNAL_ERROR", retryable: true }, "Fallback"))
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
  it("sends a JSON body with the abort signal and returns parsed data on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(503, {
          error: "Overloaded",
          code: "UPSTREAM_OVERLOADED",
          retryable: true,
          requestId: "req-1"
        })
      )
    );

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({
      status: "error",
      error: {
        message: "Overloaded",
        code: "UPSTREAM_OVERLOADED",
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({ status: "aborted" });
  });

  it("uses the generic message for non-JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`<html><pre>${LEAKED.stack}</pre></html>`, {
          status: 502,
          headers: { "content-type": "text/html" }
        })
      )
    );

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({
      status: "error",
      error: { message: "Fallback", code: "MALFORMED_RESPONSE", retryable: false }
    });
  });

  it("treats a 200 with a non-JSON body as malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 }))
    );

    await expect(postJson("/api/x", {}, "Fallback")).resolves.toEqual({
      status: "error",
      error: { message: "Fallback", code: "MALFORMED_RESPONSE", retryable: false }
    });
  });
});

describe("requestQuickBrief", () => {
  it("accepts a full Quick Brief body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, demoQuickResult)));

    const outcome = await requestQuickBrief({ idea: "an idea", constraints: [] });
    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(outcome.data.brief.verdict.decision).toBe("validate_before_building");
    }
  });

  it("rejects a 200 whose body does not look like a Quick Brief", async () => {
    for (const body of [{}, { brief: {} }, { ...demoQuickResult, brief: null }, [], "x"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, body)));
      await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual({
        status: "error",
        error: {
          message: QUICK_BRIEF_FALLBACK_MESSAGE,
          code: "MALFORMED_RESPONSE",
          retryable: false
        }
      });
    }
  });

  it("uses the Quick Brief fallback message for malformed error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { oops: true })));

    await expect(requestQuickBrief({ idea: "an idea", constraints: [] })).resolves.toEqual({
      status: "error",
      error: { message: QUICK_BRIEF_FALLBACK_MESSAGE, code: "MALFORMED_RESPONSE", retryable: false }
    });
  });

  it("posts to /api/brief", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, demoQuickResult));
    vi.stubGlobal("fetch", fetchMock);

    await requestQuickBrief({ idea: "an idea", goal: "g", constraints: ["c"] });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brief");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      idea: "an idea",
      goal: "g",
      constraints: ["c"]
    });
  });
});

describe("isQuickBriefDisplayResult", () => {
  it("accepts the shipped sample and rejects partial shapes", () => {
    expect(isQuickBriefDisplayResult(demoQuickResult)).toBe(true);
    expect(isQuickBriefDisplayResult({ ...demoQuickResult, frame: undefined })).toBe(false);
    expect(
      isQuickBriefDisplayResult({
        ...demoQuickResult,
        brief: { ...demoQuickResult.brief, validationPlan7Days: "none" }
      })
    ).toBe(false);
  });
});

describe("requestAgenda", () => {
  it("validates the agenda response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { idea: "x", topics: [1] })));

    await expect(requestAgenda({ idea: "x", panelMode: "startup" })).resolves.toEqual({
      status: "error",
      error: { message: AGENDA_FALLBACK_MESSAGE, code: "MALFORMED_RESPONSE", retryable: false }
    });
  });

  it("returns a well-formed agenda", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { idea: "x", topics: ["a", "b", "c"] }))
    );

    await expect(requestAgenda({ idea: "x", panelMode: "startup" })).resolves.toEqual({
      status: "success",
      data: { idea: "x", topics: ["a", "b", "c"] }
    });
  });
});
