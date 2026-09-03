import { afterEach, describe, expect, it, vi } from "vitest";
import { runRoundtable } from "@/lib/debate";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const topics = ["Demand", "MVP scope", "Risks"];
const idea = "A marketplace where local chefs sell weekly meal subscriptions.";

const validReport = JSON.stringify({
  executiveSummary:
    "The concept targets a repeated household problem, but the panel wants demand evidence before further investment.",
  consensus: ["Start with one neighbourhood and a single weekly delivery window."],
  disagreements: ["The panel disagrees on whether chefs or families are the harder side to recruit."],
  risks: ["Food safety obligations could delay the first paid delivery."],
  recommendedNextStep:
    "Within 2 weeks, interview 8 families and run 3 paid trial deliveries to measure repeat orders.",
  followUpQuestion: "Which neighbourhood has the highest density of repeat buyers?"
});

function reply(text: string, stopReason = "end_turn"): Response {
  return new Response(
    JSON.stringify({
      model: "test-model",
      stop_reason: stopReason,
      content: [{ type: "text", text }],
      usage: { input_tokens: 100, output_tokens: 50 }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

/**
 * Returns a fetch stub that answers the 15 persona turns with plain prose and the
 * moderator synthesis with the supplied sequence of bodies.
 */
function stubRoundtable(synthesisBodies: Array<{ text: string; stopReason?: string }>) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    call += 1;
    if (call <= 15) {
      return reply(`Persona turn ${call} with a concrete observation about demand evidence.`);
    }
    const body = synthesisBodies[call - 16];
    if (!body) throw new Error(`Unexpected model call ${call}`);
    return reply(body.text, body.stopReason);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("moderator synthesis resampling", () => {
  it("recovers a completed roundtable when the first report is truncated", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // A max_tokens cut-off leaves an opening brace with no closing brace.
    const truncated = '{\n  "executiveSummary": "The panel agrees the wedge is narrow';
    const fetchMock = stubRoundtable([
      { text: truncated, stopReason: "max_tokens" },
      { text: validReport }
    ]);

    const result = await runRoundtable(idea, topics, "startup");

    expect(result.transcript).toHaveLength(15);
    expect(result.summary.recommendedNextStep).toContain("8 families");
    expect(fetchMock).toHaveBeenCalledTimes(17);
    expect(result.diagnostics?.modelCallCount).toBe(17);
    expect(result.diagnostics?.failedModelCalls).toBe(0);
  });

  it("resamples when a summary violates the shared rendered-response contract", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const invalidReport = JSON.stringify({
      ...JSON.parse(validReport),
      consensus: [42]
    });
    const fetchMock = stubRoundtable([{ text: invalidReport }, { text: validReport }]);

    const result = await runRoundtable(idea, topics, "startup");

    expect(result.summary.consensus).toEqual([
      "Start with one neighbourhood and a single weekly delivery window."
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(17);
  });

  it("records the truncation signal so the cause is visible in diagnostics", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    stubRoundtable([
      { text: '{ "executiveSummary": "cut off', stopReason: "max_tokens" },
      { text: validReport }
    ]);

    await runRoundtable(idea, topics, "startup");

    const events = infoSpy.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .filter((event) => event.event === "model_call");
    const synthesis = events.filter((event) => String(event.stage).startsWith("moderator_synthesis"));

    expect(synthesis.map((event) => event.stage)).toEqual([
      "moderator_synthesis",
      "moderator_synthesis.resample_1"
    ]);
    expect(synthesis[0].stopReason).toBe("max_tokens");
    expect(synthesis[1].stopReason).toBe("end_turn");
    infoSpy.mockRestore();
  });

  it("gives up after a bounded number of resamples instead of retrying forever", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const unusable = { text: "I could not produce a report." };
    const fetchMock = stubRoundtable([unusable, unusable, unusable]);

    await expect(runRoundtable(idea, topics, "startup")).rejects.toThrow(
      /invalid report format/i
    );
    // 15 persona turns plus exactly three synthesis attempts.
    expect(fetchMock).toHaveBeenCalledTimes(18);
  });
});
