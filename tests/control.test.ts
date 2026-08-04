import { afterEach, describe, expect, it, vi } from "vitest";
import { runSinglePass } from "@/lib/control";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("single-pass control", () => {
  it("produces the shared brief contract in one observed model call", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "test-model");
    const summary = {
      executiveSummary:
        "The idea addresses a credible workflow problem, but urgency and repeat use need direct evidence before a broad implementation is justified.",
      consensus: ["A narrow prototype should be tested with the initial customer segment."],
      disagreements: [
        "It is unclear whether customers need a standalone product or an integration with existing tools."
      ],
      risks: ["The team may mistake positive interviews for repeat product usage."],
      recommendedNextStep:
        "Run 8 customer interviews within 2 weeks and test a manual prototype with 3 participants.",
      followUpQuestion: "Which customer segment experiences this problem every week?"
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "test-model",
          content: [{ type: "text", text: JSON.stringify(summary) }],
          usage: { input_tokens: 120, output_tokens: 80 }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "request-id": "req-control"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runSinglePass(
      "A sufficiently detailed product idea for consultants.",
      ["Demand", "MVP", "Risk"],
      "startup"
    );

    expect(result.summary).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toMatchObject({
      modelCallCount: 1,
      successfulModelCalls: 1,
      inputTokens: 120,
      outputTokens: 80,
      models: ["test-model"]
    });
  });
});
