import { afterEach, describe, expect, it, vi } from "vitest";
import { callClaude } from "@/lib/claude";
import type { RunObserver } from "@/lib/observability";
import type { ModelCallMetric } from "@/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function collectingObserver(metrics: ModelCallMetric[]): RunObserver {
  return {
    runId: "test-run",
    record(metric) {
      metrics.push(metric);
    },
    finish() {
      throw new Error("Not used by this unit test.");
    },
    snapshot() {
      throw new Error("Not used by this unit test.");
    }
  };
}

describe("Anthropic client observability", () => {
  it("records stage, latency, model, and token usage without changing the text contract", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "test-model");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "resolved-test-model",
            content: [{ type: "text", text: "Useful answer" }],
            usage: { input_tokens: 42, output_tokens: 17 }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    const metrics: ModelCallMetric[] = [];

    const text = await callClaude(
      [{ role: "user", content: "private user content" }],
      "private system prompt",
      { stage: "test_stage", observer: collectingObserver(metrics) }
    );

    expect(text).toBe("Useful answer");
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      stage: "test_stage",
      attempt: 1,
      status: "success",
      model: "resolved-test-model",
      inputTokens: 42,
      outputTokens: 17
    });
    expect(JSON.stringify(metrics)).not.toContain("private user content");
    expect(JSON.stringify(metrics)).not.toContain("private system prompt");
  });

  it("classifies a final rate limit without storing request content", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Try again later" } }), {
          status: 429,
          headers: { "content-type": "application/json" }
        })
      )
    );
    const metrics: ModelCallMetric[] = [];

    await expect(
      callClaude([{ role: "user", content: "sensitive idea" }], "system", {
        stage: "rate_limited_stage",
        observer: collectingObserver(metrics),
        maxRetries: 0
      })
    ).rejects.toMatchObject({
      code: "UPSTREAM_RATE_LIMIT",
      status: 429,
      retryable: true
    });

    expect(metrics[0]).toMatchObject({
      stage: "rate_limited_stage",
      attempt: 1,
      status: "error",
      errorCategory: "upstream_rate_limit",
      upstreamStatus: 429
    });
    expect(JSON.stringify(metrics)).not.toContain("sensitive idea");
  });

  it("retries a transient overloaded response and records each attempt", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: "overloaded_error" } }), {
          status: 529,
          headers: {
            "content-type": "application/json",
            "request-id": "req-failed",
            "retry-after": "0"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "resolved-model",
            content: [{ type: "text", text: "Recovered answer" }],
            usage: { input_tokens: 9, output_tokens: 4 }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "request-id": "req-success"
            }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const metrics: ModelCallMetric[] = [];

    const text = await callClaude([{ role: "user", content: "idea" }], "system", {
      stage: "retry_stage",
      observer: collectingObserver(metrics),
      maxRetries: 1,
      retryBaseDelayMs: 0
    });

    expect(text).toBe("Recovered answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({
      attempt: 1,
      status: "error",
      upstreamStatus: 529,
      requestId: "req-failed",
      retryDelayMs: 0
    });
    expect(metrics[1]).toMatchObject({
      attempt: 2,
      status: "success",
      requestId: "req-success"
    });
  });

  it("does not retry authentication failures", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { type: "authentication_error" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callClaude([{ role: "user", content: "idea" }], "system", {
        maxRetries: 2,
        retryBaseDelayMs: 0
      })
    ).rejects.toMatchObject({
      code: "UPSTREAM_AUTHENTICATION",
      status: 502,
      retryable: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
