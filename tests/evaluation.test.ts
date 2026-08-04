import { describe, expect, it } from "vitest";
import { getPersonaAgents } from "@/lib/agents";
import { demoResult } from "@/lib/demo";
import {
  evaluateDecisionBrief,
  evaluateIdeaBrief,
  evaluateRoundtable
} from "@/lib/evaluation";
import type { DebateEntry, RoundtableResult } from "@/types";
import { ideaBriefFixture } from "./v2-fixtures";

function strongFixture(): RoundtableResult {
  const names = getPersonaAgents("startup").map((agent) => agent.name);
  const transcript: DebateEntry[] = [];

  for (const round of [1, 2, 3]) {
    names.forEach((name, index) => {
      const priorName = names[(index + names.length - 1) % names.length];
      transcript.push({
        round,
        agentName: name,
        content:
          round === 1
            ? `My initial view identifies a concrete customer problem and a meaningful risk that needs evidence before product investment.`
            : `${priorName} raised a useful constraint. I disagree with part of that conclusion and recommend testing the assumption with customer evidence.`
      });
    });
  }

  return {
    agenda: ["Customer demand", "MVP scope", "Distribution", "Risks"],
    panelMode: "startup",
    transcript,
    summary: {
      executiveSummary:
        "The concept addresses a plausible workflow problem, but the team should validate urgency and repeat usage before investing in a broad product.",
      consensus: ["The narrow workflow should be tested before expanding the product scope."],
      disagreements: [
        "The panel disagrees on whether customers will pay before the workflow is integrated with existing tools."
      ],
      risks: ["A polished prototype could hide weak demand and low repeat usage."],
      recommendedNextStep:
        "Run 8 customer interviews within 2 weeks and test a manual prototype with at least 3 participants.",
      followUpQuestion: "Which customer segment experiences this problem every week?"
    }
  };
}

describe("roundtable quality evaluator", () => {
  it("passes an honest, bounded and testable V2 Idea Brief", () => {
    const report = evaluateIdeaBrief(ideaBriefFixture);

    expect(report).toMatchObject({ passed: true, score: 100 });
  });

  it("fails a V2 brief that hides its evidence gap", () => {
    const brief = structuredClone(ideaBriefFixture);
    brief.verdict.flags = [];

    const report = evaluateIdeaBrief(brief);
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.name === "evidence_honesty")?.passed)
      .toBe(false);
  });

  it("uses the same output-only rubric for experiment and control briefs", () => {
    const report = evaluateDecisionBrief(strongFixture().summary);

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it("passes the illustrative sample shipped with the interface", () => {
    const report = evaluateRoundtable(demoResult);

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it("passes a structurally complete, cross-referencing and actionable result", () => {
    const report = evaluateRoundtable(strongFixture());

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it("fails a shallow result even when the response shape is technically valid", () => {
    const weak = strongFixture();
    weak.transcript = weak.transcript.slice(0, 2);
    weak.summary.disagreements = [];
    weak.summary.recommendedNextStep = "Think about it more.";

    const report = evaluateRoundtable(weak);

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.name === "transcript_integrity")?.passed).toBe(
      false
    );
    expect(
      report.checks.find((check) => check.name === "disagreement_preservation")?.passed
    ).toBe(false);
    expect(evaluateDecisionBrief(weak.summary).passed).toBe(false);
  });
});
