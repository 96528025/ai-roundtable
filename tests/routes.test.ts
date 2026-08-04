import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as runRoundtableRoute } from "@/app/api/roundtable/route";
import { IDEA_MAX_CHARACTERS } from "@/lib/limits";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function roundtableRequest(body: unknown): Request {
  return new Request("http://localhost/api/roundtable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const validTopics = ["Demand", "MVP", "Risk"];

describe("roundtable route error contract", () => {
  it("returns 400 for an oversized user-controlled idea", async () => {
    const response = await runRoundtableRoute(
      roundtableRequest({
        idea: "A".repeat(IDEA_MAX_CHARACTERS + 1),
        topics: validTopics,
        panelMode: "startup"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_IDEA",
      retryable: false
    });
  });

  it("returns 503 when the server is not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    const response = await runRoundtableRoute(
      roundtableRequest({
        idea: "A sufficiently detailed product idea",
        topics: validTopics,
        panelMode: "startup"
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "SERVICE_CONFIGURATION",
      retryable: false
    });
  });

  it("returns 429 after a non-retried rate limit in the test configuration", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MAX_RETRIES", "0");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { type: "rate_limit_error" } }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "3",
            "request-id": "req-rate-limit"
          }
        })
      )
    );

    const response = await runRoundtableRoute(
      roundtableRequest({
        idea: "A sufficiently detailed product idea",
        topics: validTopics,
        panelMode: "startup"
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: "UPSTREAM_RATE_LIMIT",
      retryable: true,
      requestId: "req-rate-limit"
    });
  });
});
