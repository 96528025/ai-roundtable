import { describe, expect, it } from "vitest";
import { routeIdea } from "@/lib/v2/planner";
import { demoQuickResult } from "@/lib/v2/demo";
import { normalizeIdeaRequest, parseIdeaBrief, parseIdeaFrame } from "@/lib/v2/validation";
import { ideaBriefFixture, ideaFrameFixture } from "./v2-fixtures";

describe("V2 idea contracts", () => {
  it("normalizes optional decision context", () => {
    expect(
      normalizeIdeaRequest({
        idea: "  A sufficiently detailed shopping comparison product.  ",
        goal: "  Decide whether to build it.  ",
        constraints: ["  One-week prototype  "]
      })
    ).toEqual({
      idea: "A sufficiently detailed shopping comparison product.",
      goal: "Decide whether to build it.",
      constraints: ["One-week prototype"]
    });
  });

  it("treats invalid user constraints as a client error", () => {
    expect(() =>
      normalizeIdeaRequest({
        idea: "A sufficiently detailed shopping comparison product.",
        constraints: ["A".repeat(301)]
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST", status: 400 }));
  });

  it("parses a bounded planner frame", () => {
    expect(parseIdeaFrame(JSON.stringify(ideaFrameFixture))).toEqual(ideaFrameFixture);
  });

  it("parses an honest no-research brief", () => {
    expect(parseIdeaBrief(JSON.stringify(ideaBriefFixture))).toEqual(ideaBriefFixture);
    expect(parseIdeaBrief(JSON.stringify(demoQuickResult.brief))).toEqual(
      demoQuickResult.brief
    );
  });

  it("rejects high confidence when external research was not run", () => {
    const brief = structuredClone(ideaBriefFixture);
    brief.verdict.confidence = "high";

    expect(() => parseIdeaBrief(JSON.stringify(brief))).toThrow(/high confidence/i);
  });

  it("rejects unsupported evidence and alternative citations", () => {
    const brief = structuredClone(ideaBriefFixture);
    brief.evidence.claims[0].kind = "evidence";
    brief.evidence.claims[0].sourceIds = ["missing-source"];

    expect(() => parseIdeaBrief(JSON.stringify(brief))).toThrow(/unknown source/i);
  });

  it("recommends deeper work without automatically leaving the Quick path", () => {
    const frame = structuredClone(ideaFrameFixture);
    frame.riskSignals = ["sensitive_data"];
    frame.routingSignals.buildComplexity = "high";

    expect(routeIdea(frame)).toMatchObject({
      selectedPath: "quick",
      fullRoundtableRecommended: true,
      reasonCodes: expect.arrayContaining(["high_build_complexity", "high_risk"])
    });
  });
});
