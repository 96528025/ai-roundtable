import { getPersonaAgents } from "@/lib/agents";
import type { IdeaBrief } from "@/lib/v2/types";
import type { DebateEntry, RoundtableResult, RoundtableSummary } from "@/types";

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

function actionableNextStep(nextStep: string): boolean {
  const hasActionVerb =
    /\b(test|interview|measure|build|run|compare|contact|schedule|define|choose|launch|validate|prototype|survey|track)\b/i.test(
      nextStep
    );
  const hasConstraint = /\b\d+\b|\b(day|days|week|weeks|month|months)\b/i.test(
    nextStep
  );
  return validText(nextStep, 50) && hasActionVerb && hasConstraint;
}

export function evaluateDecisionBrief(summary: RoundtableSummary): EvaluationReport {
  const executiveSummaryPassed = validText(summary.executiveSummary, 80);
  const evidenceSectionsPassed =
    summary.consensus.length > 0 &&
    summary.consensus.every((item) => validText(item)) &&
    summary.risks.length > 0 &&
    summary.risks.every((item) => validText(item));
  const disagreementPassed =
    summary.disagreements.length > 0 &&
    summary.disagreements.some((item) => validText(item, 24));
  const actionabilityPassed = actionableNextStep(summary.recommendedNextStep);
  const followUpPassed =
    validText(summary.followUpQuestion, 20) && summary.followUpQuestion.includes("?");

  const checks: EvaluationCheck[] = [
    {
      name: "executive_summary_substance",
      passed: executiveSummaryPassed,
      score: executiveSummaryPassed ? 20 : 0,
      maxScore: 20,
      detail: "Requires a non-trivial executive summary."
    },
    {
      name: "evidence_sections",
      passed: evidenceSectionsPassed,
      score: evidenceSectionsPassed ? 20 : 0,
      maxScore: 20,
      detail: "Requires non-trivial consensus and risk sections."
    },
    {
      name: "disagreement_preservation",
      passed: disagreementPassed,
      score: disagreementPassed ? 20 : 0,
      maxScore: 20,
      detail: `${summary.disagreements.length} explicit disagreement(s).`
    },
    {
      name: "next_step_actionability",
      passed: actionabilityPassed,
      score: actionabilityPassed ? 25 : 0,
      maxScore: 25,
      detail: "Requires a concrete action plus a numeric or time-bound constraint."
    },
    {
      name: "follow_up_specificity",
      passed: followUpPassed,
      score: followUpPassed ? 15 : 0,
      maxScore: 15,
      detail: "Requires a non-trivial question."
    }
  ];
  const score = checks.reduce((total, check) => total + check.score, 0);

  return {
    score,
    passed: score >= 80 && disagreementPassed && actionabilityPassed,
    checks
  };
}

export function evaluateIdeaBrief(brief: IdeaBrief): EvaluationReport {
  const verdictPassed =
    validText(brief.verdict.rationale, 80) &&
    brief.verdict.decision.length > 0 &&
    !(brief.evidence.status === "not_researched" && brief.verdict.confidence === "high");
  const evidenceHonestyPassed =
    brief.evidence.unansweredQuestions.length > 0 &&
    (brief.evidence.status !== "not_researched" ||
      (brief.evidence.sources.length === 0 &&
        brief.evidence.claims.every((claim) => claim.kind !== "evidence") &&
        brief.verdict.flags.includes("evidence_gap")));
  const mvpPassed =
    validText(brief.recommendedMvp.productPromise, 30) &&
    brief.recommendedMvp.mustHave.length > 0 &&
    brief.recommendedMvp.notNow.length > 0 &&
    validText(brief.recommendedMvp.successSignal, 40);
  const riskPassed =
    brief.biggestRisksAndAssumptions.length >= 2 &&
    brief.biggestRisksAndAssumptions.every(
      (risk) => validText(risk.risk, 20) && validText(risk.cheapestTest, 20)
    );
  const validationPassed =
    brief.validationPlan7Days.length >= 3 &&
    brief.validationPlan7Days.every(
      (step) =>
        validText(step.action, 20) &&
        validText(step.evidenceToCollect, 20) &&
        validText(step.decisionThreshold, 20)
    );
  const followUpPassed =
    validText(brief.followUpQuestion.question, 20) &&
    brief.followUpQuestion.question.endsWith("?") &&
    validText(brief.followUpQuestion.answerCouldChange, 20);

  const checks: EvaluationCheck[] = [
    {
      name: "verdict_decisiveness",
      passed: verdictPassed,
      score: verdictPassed ? 20 : 0,
      maxScore: 20,
      detail: "Requires a clear, calibrated verdict with substantive rationale."
    },
    {
      name: "evidence_honesty",
      passed: evidenceHonestyPassed,
      score: evidenceHonestyPassed ? 20 : 0,
      maxScore: 20,
      detail: "Requires explicit evidence gaps and no unsupported sourced claims."
    },
    {
      name: "mvp_scope",
      passed: mvpPassed,
      score: mvpPassed ? 20 : 0,
      maxScore: 20,
      detail: "Requires a bounded promise, must-haves, exclusions, and success signal."
    },
    {
      name: "risk_testability",
      passed: riskPassed,
      score: riskPassed ? 15 : 0,
      maxScore: 15,
      detail: "Requires at least two material risks with cheap tests."
    },
    {
      name: "seven_day_validation",
      passed: validationPassed,
      score: validationPassed ? 20 : 0,
      maxScore: 20,
      detail: "Requires actions, evidence, and decision thresholds across at least three steps."
    },
    {
      name: "follow_up_impact",
      passed: followUpPassed,
      score: followUpPassed ? 5 : 0,
      maxScore: 5,
      detail: "Requires one question and an explanation of how the answer changes the decision."
    }
  ];
  const score = checks.reduce((total, check) => total + check.score, 0);

  return {
    score,
    passed: score >= 80 && verdictPassed && evidenceHonestyPassed && validationPassed,
    checks
  };
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

  const actionabilityPassed = actionableNextStep(result.summary.recommendedNextStep);

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
