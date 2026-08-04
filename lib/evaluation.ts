import { getPersonaAgents } from "@/lib/agents";
import type { DebateEntry, RoundtableResult } from "@/types";

export type EvaluationCheck = {
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  detail: string;
};

export type EvaluationReport = {
  score: number;
  passed: boolean;
  checks: EvaluationCheck[];
};

function validText(value: string, minimumLength = 12): boolean {
  return value.trim().length >= minimumLength;
}

function mentionsAnotherAgent(entry: DebateEntry, agentNames: string[]): boolean {
  const content = entry.content.toLowerCase();
  return agentNames.some(
    (name) => name !== entry.agentName && content.includes(name.toLowerCase())
  );
}

export function evaluateRoundtable(result: RoundtableResult): EvaluationReport {
  const agentNames = getPersonaAgents(result.panelMode).map((agent) => agent.name);
  const expectedTurns = agentNames.length * 3;
  const turnKeys = new Set(
    result.transcript.map((entry) => `${entry.round}:${entry.agentName}`)
  );
  const expectedTurnKeys = agentNames.flatMap((name) =>
    [1, 2, 3].map((round) => `${round}:${name}`)
  );
  const integrityPassed =
    result.transcript.length === expectedTurns &&
    expectedTurnKeys.every((key) => turnKeys.has(key)) &&
    result.transcript.every((entry) => validText(entry.content, 40));

  const crossResponseTurns = result.transcript.filter((entry) => entry.round >= 2);
  const crossResponseCount = crossResponseTurns.filter((entry) =>
    mentionsAnotherAgent(entry, agentNames)
  ).length;
  const crossResponseRate =
    crossResponseTurns.length > 0 ? crossResponseCount / crossResponseTurns.length : 0;

  const summaryLists = [
    result.summary.consensus,
    result.summary.disagreements,
    result.summary.risks
  ];
  const summaryComplete =
    validText(result.summary.executiveSummary, 60) &&
    summaryLists.every(
      (items) => items.length > 0 && items.every((item) => validText(item))
    ) &&
    validText(result.summary.followUpQuestion, 20);

  const disagreementPreserved =
    result.summary.disagreements.length > 0 &&
    result.summary.disagreements.some((item) => validText(item, 24));

  const nextStep = result.summary.recommendedNextStep;
  const hasActionVerb =
    /\b(test|interview|measure|build|run|compare|contact|schedule|define|choose|launch|validate|prototype|survey|track)\b/i.test(
      nextStep
    );
  const hasConstraint = /\b\d+\b|\b(day|days|week|weeks|month|months)\b/i.test(nextStep);
  const actionabilityPassed = validText(nextStep, 50) && hasActionVerb && hasConstraint;

  const checks: EvaluationCheck[] = [
    {
      name: "transcript_integrity",
      passed: integrityPassed,
      score: integrityPassed ? 30 : 0,
      maxScore: 30,
      detail: `${result.transcript.length}/${expectedTurns} turns; ${turnKeys.size} unique round-agent pairs.`
    },
    {
      name: "cross_agent_engagement",
      passed: crossResponseRate >= 0.8,
      score: Math.round(Math.min(crossResponseRate / 0.8, 1) * 25),
      maxScore: 25,
      detail: `${crossResponseCount}/${crossResponseTurns.length} round 2-3 turns name another agent.`
    },
    {
      name: "disagreement_preservation",
      passed: disagreementPreserved,
      score: disagreementPreserved ? 15 : 0,
      maxScore: 15,
      detail: `${result.summary.disagreements.length} explicit disagreement(s) in the final brief.`
    },
    {
      name: "summary_completeness",
      passed: summaryComplete,
      score: summaryComplete ? 15 : 0,
      maxScore: 15,
      detail: "Checks the required summary fields for non-trivial content."
    },
    {
      name: "next_step_actionability",
      passed: actionabilityPassed,
      score: actionabilityPassed ? 15 : 0,
      maxScore: 15,
      detail: "Requires a concrete action plus a numeric or time-bound constraint."
    }
  ];

  const score = checks.reduce((total, check) => total + check.score, 0);
  return {
    score,
    passed:
      score >= 80 &&
      integrityPassed &&
      crossResponseRate >= 0.8 &&
      disagreementPreserved,
    checks
  };
}
