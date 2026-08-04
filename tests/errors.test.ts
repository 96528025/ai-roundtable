import { describe, expect, it } from "vitest";
import { AppError, invalidRequest, toPublicError } from "@/lib/errors";

describe("public error mapping", () => {
  it("returns 400 only for client-controlled validation errors", () => {
    expect(toPublicError(invalidRequest("Bad agenda", "INVALID_AGENDA"), "Fallback"))
      .toMatchObject({
        status: 400,
        body: {
          error: "Bad agenda",
          code: "INVALID_AGENDA",
          retryable: false
        }
      });
  });

  it("preserves retry semantics and a safe request ID for upstream errors", () => {
    const error = new AppError("Temporarily limited", {
      code: "UPSTREAM_RATE_LIMIT",
      status: 429,
      retryable: true,
      retryAfterMs: 1_500,
      requestId: "req-safe"
    });

    expect(toPublicError(error, "Fallback")).toEqual({
      status: 429,
      body: {
        error: "Temporarily limited",
        code: "UPSTREAM_RATE_LIMIT",
        retryable: true,
        requestId: "req-safe"
      },
      headers: { "retry-after": "2" }
    });
  });

  it("does not expose unexpected internal error messages", () => {
    expect(toPublicError(new Error("database password leaked"), "Safe fallback"))
      .toMatchObject({
        status: 500,
        body: {
          error: "Safe fallback",
          code: "INTERNAL_ERROR"
        }
      });
  });
});
