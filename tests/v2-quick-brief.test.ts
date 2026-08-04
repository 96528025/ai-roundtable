import { afterEach, describe, expect, it, vi } from "vitest";
import { runDirectBrief, runQuickBrief } from "@/lib/v2/quick-brief";
import { ideaBriefFixture, ideaFrameFixture } from "./v2-fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function reply(value: unknown): Response {
  return new Response(
    JSON.stringify({
      model: "test-model",
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: typeof value === "string" ? value : JSON.stringify(value)
        }
      ],
      usage: { input_tokens: 120, output_tokens: 80 }
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

const request = {
  idea: "A browser extension that turns shopping tabs into a decision brief.",
  goal: "Decide whether to build an MVP.",
  constraints: ["One week of development"]
};

describe("Planned Quick Brief", () => {
  it("uses one planner call and one brief call on the normal path", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(ideaFrameFixture))
      .mockResolvedValueOnce(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runQuickBrief(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.frame).toEqual(ideaFrameFixture);
    expect(result.brief).toEqual(ideaBriefFixture);
    expect(result.diagnostics).toMatchObject({
      modelCallCount: 2,
      successfulModelCalls: 2,
      inputTokens: 240,
      outputTokens: 160
    });
    expect(result.budget).toMatchObject({
      maxCallAttempts: 4,
      usedCallAttempts: 2,
      retryAttempts: 0,
      requestedOutputTokens: 2600
    });
  });

  it("resamples one malformed final brief without repeating the planner", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(ideaFrameFixture))
      .mockResolvedValueOnce(reply("{ truncated"))
      .mockResolvedValueOnce(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runQuickBrief(request);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.brief.verdict.decision).toBe("validate_before_building");
    expect(result.budget.usedCallAttempts).toBe(3);
  });

  it("resamples one malformed planner frame while preserving brief capacity", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("{ incomplete planner"))
      .mockResolvedValueOnce(reply(ideaFrameFixture))
      .mockResolvedValueOnce(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runQuickBrief(request);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.frame).toEqual(ideaFrameFixture);
    expect(result.brief).toEqual(ideaBriefFixture);
    expect(result.budget.usedCallAttempts).toBe(3);
  });

  it("counts a transport retry against the shared attempt budget", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: "overloaded_error" } }), {
          status: 529,
          headers: {
            "content-type": "application/json",
            "retry-after": "0"
          }
        })
      )
      .mockResolvedValueOnce(reply(ideaFrameFixture))
      .mockResolvedValueOnce(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runQuickBrief(request);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.budget).toMatchObject({
      usedCallAttempts: 3,
      retryAttempts: 1,
      requestedOutputTokens: 3200
    });
  });

  it("never exceeds four attempts when retry and resampling both occur", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: "overloaded_error" } }), {
          status: 529,
          headers: {
            "content-type": "application/json",
            "retry-after": "0"
          }
        })
      )
      .mockResolvedValueOnce(reply(ideaFrameFixture))
      .mockResolvedValueOnce(reply("not valid json"))
      .mockResolvedValueOnce(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runQuickBrief(request);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.budget.usedCallAttempts).toBe(4);
  });
});

describe("Direct Brief control", () => {
  it("produces the same brief contract in one normal-path call", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDirectBrief(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.brief).toEqual(ideaBriefFixture);
    expect(result.budget.usedCallAttempts).toBe(1);
  });
});
