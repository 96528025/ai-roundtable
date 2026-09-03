import { describe, expect, it } from "vitest";
import { routeIdea } from "@/lib/v2/planner";
import { demoResult } from "@/lib/demo";
import { demoQuickResult } from "@/lib/v2/demo";
import {
  parseQuickBriefDisplayValue,
  parseRoundtableDisplayValue
} from "@/lib/v2/contract-schema";
import {
  normalizeIdeaRequest,
  parseIdeaBrief,
  parseIdeaFrame,
  parseQuickIdeaBrief
} from "@/lib/v2/validation";
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

  it("requires the Quick Brief writer to stay in quick mode without external research", () => {
    expect(parseQuickIdeaBrief(JSON.stringify(ideaBriefFixture))).toEqual(ideaBriefFixture);

    const fullMode = structuredClone(ideaBriefFixture);
    fullMode.mode = "full";
    expect(() => parseQuickIdeaBrief(JSON.stringify(fullMode))).toThrowError(
      expect.objectContaining({ code: "INVALID_MODEL_RESPONSE", status: 502 })
    );
    expect(() => parseQuickIdeaBrief(JSON.stringify(fullMode))).toThrow(/mode quick/i);

    const researched = structuredClone(ideaBriefFixture);
    researched.evidence.status = "limited";
    expect(() => parseQuickIdeaBrief(JSON.stringify(researched))).toThrow(/not_researched/i);
  });

  it("keeps the shipped sample valid against the display contract", () => {
    expect(parseQuickBriefDisplayValue(demoQuickResult)).toEqual(demoQuickResult);
    expect(parseQuickBriefDisplayValue({ ...demoQuickResult, budget: undefined })).toEqual(
      demoQuickResult
    );
  });

  it("keeps the shipped roundtable sample valid against its display contract", () => {
    expect(parseRoundtableDisplayValue(demoResult)).toEqual(demoResult);
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
