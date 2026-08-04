import { AppError, invalidRequest } from "@/lib/errors";
import { validateIdea } from "@/lib/debate";
import type {
  Alternative,
  BriefRisk,
  EvidenceClaim,
  EvidenceSource,
  IdeaBrief,
  IdeaFrame,
  IdeaRequest,
  RiskSignal,
  Unknown,
  ValidationStep,
  VerdictDecision,
  VerdictFlag
} from "@/lib/v2/types";

const GOAL_MAX_CHARACTERS = 1_000;
const CONSTRAINT_MAX_CHARACTERS = 300;
const MAX_CONSTRAINTS = 5;

function invalidModelResponse(message: string): AppError {
  return new AppError(message, {
    code: "INVALID_MODEL_RESPONSE",
    status: 502
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidModelResponse(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 1_200): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidModelResponse(`${label} must be non-empty text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw invalidModelResponse(`${label} is too long.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, label, maximum);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw invalidModelResponse(`${label} has an unsupported value.`);
  }
  return value as T;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidModelResponse(`${label} must be a boolean.`);
  }
  return value;
}

function array<T>(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  parseItem: (item: unknown, index: number) => T
): T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw invalidModelResponse(`${label} must contain ${minimum} to ${maximum} items.`);
  }
  return value.map(parseItem);
}

function textArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  itemMaximum = 500
): string[] {
  return array(value, label, minimum, maximum, (item, index) =>
    text(item, `${label}[${index}]`, itemMaximum)
  );
}

function extractJsonObject(raw: string, label: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw invalidModelResponse(`${label} did not contain a complete JSON object.`);
  }
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch (error) {
    throw new AppError(`${label} returned invalid JSON.`, {
      code: "INVALID_MODEL_RESPONSE",
      status: 502,
      cause: error
    });
  }
}

export function normalizeIdeaRequest(value: unknown): IdeaRequest {
  const body =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const idea = validateIdea(body.idea);
  let goal: string | undefined;
  if (body.goal !== undefined && body.goal !== null && body.goal !== "") {
    if (typeof body.goal !== "string" || body.goal.trim().length > GOAL_MAX_CHARACTERS) {
      throw invalidRequest(
        `Keep the decision goal under ${GOAL_MAX_CHARACTERS.toLocaleString("en-US")} characters.`,
        "INVALID_REQUEST"
      );
    }
    goal = body.goal.trim() || undefined;
  }

  let constraints: string[] = [];
  if (body.constraints !== undefined) {
    if (!Array.isArray(body.constraints) || body.constraints.length > MAX_CONSTRAINTS) {
      throw invalidRequest(
        `Provide no more than ${MAX_CONSTRAINTS} constraints.`,
        "INVALID_REQUEST"
      );
    }
    constraints = body.constraints.map((constraint, index) => {
      if (
        typeof constraint !== "string" ||
        constraint.trim().length === 0 ||
        constraint.trim().length > CONSTRAINT_MAX_CHARACTERS
      ) {
        throw invalidRequest(
          `Constraint ${index + 1} must be non-empty and under ${CONSTRAINT_MAX_CHARACTERS} characters.`,
          "INVALID_REQUEST"
        );
      }
      return constraint.trim();
    });
  }

  return { idea, goal, constraints };
}

function parseUnknown(value: unknown, index: number): Unknown {
  const item = record(value, `unknowns[${index}]`);
  return {
    question: text(item.question, `unknowns[${index}].question`, 400),
    impact: oneOf(item.impact, ["low", "medium", "high"], `unknowns[${index}].impact`),
    answerableBy: oneOf(
      item.answerableBy,
      ["user", "research", "analysis"],
      `unknowns[${index}].answerableBy`
    ),
    mayChangeVerdict: booleanValue(
      item.mayChangeVerdict,
      `unknowns[${index}].mayChangeVerdict`
    )
  };
}

const riskSignals: readonly RiskSignal[] = [
  "regulated_domain",
  "sensitive_data",
  "marketplace_operations",
  "hardware_dependency",
  "high_build_cost",
  "high_ambiguity"
];

export function parseIdeaFrame(raw: string): IdeaFrame {
  const value = record(extractJsonObject(raw, "The planner"), "IdeaFrame");
  const routing = record(value.routingSignals, "routingSignals");

  return {
    summary: text(value.summary, "summary", 700),
    targetUser: text(value.targetUser, "targetUser", 500),
    problem: text(value.problem, "problem", 700),
    desiredOutcome: text(value.desiredOutcome, "desiredOutcome", 500),
    currentWorkaround: text(value.currentWorkaround, "currentWorkaround", 500),
    assumptions: textArray(value.assumptions, "assumptions", 1, 5, 400),
    unknowns: array(value.unknowns, "unknowns", 1, 5, parseUnknown),
    riskSignals: array(value.riskSignals, "riskSignals", 0, 6, (item, index) =>
      oneOf(item, riskSignals, `riskSignals[${index}]`)
    ),
    routingSignals: {
      researchNeed: oneOf(
        routing.researchNeed,
        ["low", "medium", "high"],
        "routingSignals.researchNeed"
      ),
      ambiguity: oneOf(
        routing.ambiguity,
        ["low", "medium", "high"],
        "routingSignals.ambiguity"
      ),
      buildComplexity: oneOf(
        routing.buildComplexity,
        ["low", "medium", "high"],
        "routingSignals.buildComplexity"
      ),
      deliberationValue: oneOf(
        routing.deliberationValue,
        ["low", "medium", "high"],
        "routingSignals.deliberationValue"
      )
    }
  };
}

function parseSource(value: unknown, index: number): EvidenceSource {
  const item = record(value, `sources[${index}]`);
  const url = text(item.url, `sources[${index}].url`, 2_000);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
  } catch {
    throw invalidModelResponse(`sources[${index}].url must be an HTTP URL.`);
  }
  return {
    id: text(item.id, `sources[${index}].id`, 80),
    title: text(item.title, `sources[${index}].title`, 400),
    url,
    publisher: text(item.publisher, `sources[${index}].publisher`, 200),
    publishedAt: optionalText(item.publishedAt, `sources[${index}].publishedAt`, 40),
    accessedAt: text(item.accessedAt, `sources[${index}].accessedAt`, 40)
  };
}

function parseClaim(value: unknown, index: number): EvidenceClaim {
  const item = record(value, `claims[${index}]`);
  return {
    id: text(item.id, `claims[${index}].id`, 80),
    text: text(item.text, `claims[${index}].text`, 700),
    kind: oneOf(
      item.kind,
      ["evidence", "inference", "assumption"],
      `claims[${index}].kind`
    ),
    sourceIds: textArray(item.sourceIds, `claims[${index}].sourceIds`, 0, 5, 80),
    confidence: oneOf(
      item.confidence,
      ["low", "medium", "high"],
      `claims[${index}].confidence`
    )
  };
}

function parseAlternative(value: unknown, index: number): Alternative {
  const item = record(value, `existingAlternatives.items[${index}]`);
  return {
    name: text(item.name, `existingAlternatives.items[${index}].name`, 200),
    category: text(item.category, `existingAlternatives.items[${index}].category`, 200),
    relevance: text(item.relevance, `existingAlternatives.items[${index}].relevance`, 500),
    basis: oneOf(
      item.basis,
      ["user_input", "inference", "external_evidence"],
      `existingAlternatives.items[${index}].basis`
    ),
    sourceIds: textArray(
      item.sourceIds,
      `existingAlternatives.items[${index}].sourceIds`,
      0,
      5,
      80
    )
  };
}

function parseRisk(value: unknown, index: number): BriefRisk {
  const item = record(value, `biggestRisksAndAssumptions[${index}]`);
  return {
    risk: text(item.risk, `biggestRisksAndAssumptions[${index}].risk`, 500),
    type: oneOf(
      item.type,
      ["desirability", "viability", "feasibility", "trust"],
      `biggestRisksAndAssumptions[${index}].type`
    ),
    assumption: text(
      item.assumption,
      `biggestRisksAndAssumptions[${index}].assumption`,
      500
    ),
    cheapestTest: text(
      item.cheapestTest,
      `biggestRisksAndAssumptions[${index}].cheapestTest`,
      500
    )
  };
}

function parseValidationStep(value: unknown, index: number): ValidationStep {
  const item = record(value, `validationPlan7Days[${index}]`);
  return {
    days: text(item.days, `validationPlan7Days[${index}].days`, 80),
    action: text(item.action, `validationPlan7Days[${index}].action`, 500),
    evidenceToCollect: text(
      item.evidenceToCollect,
      `validationPlan7Days[${index}].evidenceToCollect`,
      500
    ),
    decisionThreshold: text(
      item.decisionThreshold,
      `validationPlan7Days[${index}].decisionThreshold`,
      500
    )
  };
}

const verdictDecisions: readonly VerdictDecision[] = [
  "proceed_to_mvp",
  "validate_before_building",
  "personal_or_portfolio",
  "do_not_prioritize",
  "insufficient_evidence"
];

const verdictFlags: readonly VerdictFlag[] = [
  "weak_differentiation",
  "no_clear_monetization",
  "high_execution_risk",
  "evidence_gap"
];

export function parseIdeaBrief(raw: string): IdeaBrief {
  const value = record(extractJsonObject(raw, "The brief writer"), "IdeaBrief");
  const verdict = record(value.verdict, "verdict");
  const target = record(value.targetUserAndProblem, "targetUserAndProblem");
  const evidence = record(value.evidence, "evidence");
  const alternatives = record(value.existingAlternatives, "existingAlternatives");
  const mvp = record(value.recommendedMvp, "recommendedMvp");
  const platform = record(value.platformRecommendation, "platformRecommendation");
  const technical = record(value.technicalApproach, "technicalApproach");
  const distribution = record(value.distribution, "distribution");
  const monetization = record(value.monetization, "monetization");
  const followUp = record(value.followUpQuestion, "followUpQuestion");

  const parsed: IdeaBrief = {
    schemaVersion: oneOf(value.schemaVersion, ["2.0"], "schemaVersion"),
    mode: oneOf(value.mode, ["quick", "full"], "mode"),
    ideaSummary: text(value.ideaSummary, "ideaSummary", 800),
    verdict: {
      decision: oneOf(verdict.decision, verdictDecisions, "verdict.decision"),
      confidence: oneOf(
        verdict.confidence,
        ["low", "medium", "high"],
        "verdict.confidence"
      ),
      rationale: text(verdict.rationale, "verdict.rationale", 1_000),
      flags: array(verdict.flags, "verdict.flags", 0, 4, (item, index) =>
        oneOf(item, verdictFlags, `verdict.flags[${index}]`)
      )
    },
    targetUserAndProblem: {
      targetUser: text(target.targetUser, "targetUserAndProblem.targetUser", 500),
      problem: text(target.problem, "targetUserAndProblem.problem", 700),
      currentWorkaround: text(
        target.currentWorkaround,
        "targetUserAndProblem.currentWorkaround",
        500
      ),
      evidenceBasis: oneOf(
        target.evidenceBasis,
        ["user_input", "inference", "external_evidence"],
        "targetUserAndProblem.evidenceBasis"
      )
    },
    evidence: {
      status: oneOf(
        evidence.status,
        ["not_researched", "limited", "sufficient", "conflicting"],
        "evidence.status"
      ),
      sources: array(evidence.sources, "evidence.sources", 0, 8, parseSource),
      claims: array(evidence.claims, "evidence.claims", 0, 12, parseClaim),
      unansweredQuestions: textArray(
        evidence.unansweredQuestions,
        "evidence.unansweredQuestions",
        1,
        5,
        400
      )
    },
    existingAlternatives: {
      status: oneOf(
        alternatives.status,
        ["not_researched", "partial", "researched"],
        "existingAlternatives.status"
      ),
      items: array(
        alternatives.items,
        "existingAlternatives.items",
        0,
        5,
        parseAlternative
      ),
      researchTargets: textArray(
        alternatives.researchTargets,
        "existingAlternatives.researchTargets",
        1,
        5,
        300
      )
    },
    differentiationOpportunities: textArray(
      value.differentiationOpportunities,
      "differentiationOpportunities",
      1,
      3,
      500
    ),
    recommendedMvp: {
      productPromise: text(mvp.productPromise, "recommendedMvp.productPromise", 500),
      mustHave: textArray(mvp.mustHave, "recommendedMvp.mustHave", 1, 4, 300),
      notNow: textArray(mvp.notNow, "recommendedMvp.notNow", 1, 4, 300),
      successSignal: text(mvp.successSignal, "recommendedMvp.successSignal", 500)
    },
    platformRecommendation: {
      choice: oneOf(
        platform.choice,
        ["web", "pwa", "native_app", "no_build_yet"],
        "platformRecommendation.choice"
      ),
      rationale: text(platform.rationale, "platformRecommendation.rationale", 700)
    },
    technicalApproach: {
      architecture: text(technical.architecture, "technicalApproach.architecture", 700),
      externalDependencies: textArray(
        technical.externalDependencies,
        "technicalApproach.externalDependencies",
        0,
        5,
        300
      ),
      complexity: oneOf(
        technical.complexity,
        ["low", "medium", "high"],
        "technicalApproach.complexity"
      ),
      keyUnknowns: textArray(
        technical.keyUnknowns,
        "technicalApproach.keyUnknowns",
        1,
        4,
        400
      )
    },
    distribution: {
      firstUsers: text(distribution.firstUsers, "distribution.firstUsers", 500),
      channels: textArray(distribution.channels, "distribution.channels", 1, 4, 300),
      activationMoment: text(
        distribution.activationMoment,
        "distribution.activationMoment",
        500
      )
    },
    monetization: {
      outlook: oneOf(
        monetization.outlook,
        ["plausible", "unclear", "unlikely", "not_required"],
        "monetization.outlook"
      ),
      rationale: text(monetization.rationale, "monetization.rationale", 700),
      validation: text(monetization.validation, "monetization.validation", 500)
    },
    biggestRisksAndAssumptions: array(
      value.biggestRisksAndAssumptions,
      "biggestRisksAndAssumptions",
      2,
      5,
      parseRisk
    ),
    validationPlan7Days: array(
      value.validationPlan7Days,
      "validationPlan7Days",
      3,
      5,
      parseValidationStep
    ),
    followUpQuestion: {
      question: text(followUp.question, "followUpQuestion.question", 400),
      whyItMatters: text(followUp.whyItMatters, "followUpQuestion.whyItMatters", 500),
      answerCouldChange: text(
        followUp.answerCouldChange,
        "followUpQuestion.answerCouldChange",
        500
      )
    }
  };

  validateEvidenceIntegrity(parsed);
  return parsed;
}

function validateEvidenceIntegrity(brief: IdeaBrief): void {
  const sourceIds = new Set(brief.evidence.sources.map((source) => source.id));
  if (sourceIds.size !== brief.evidence.sources.length) {
    throw invalidModelResponse("Evidence source IDs must be unique.");
  }
  const claimIds = new Set(brief.evidence.claims.map((claim) => claim.id));
  if (claimIds.size !== brief.evidence.claims.length) {
    throw invalidModelResponse("Evidence claim IDs must be unique.");
  }

  for (const claim of brief.evidence.claims) {
    if (claim.sourceIds.some((id) => !sourceIds.has(id))) {
      throw invalidModelResponse(`Evidence claim ${claim.id} references an unknown source.`);
    }
    if (claim.kind === "evidence" && claim.sourceIds.length === 0) {
      throw invalidModelResponse(`Evidence claim ${claim.id} requires a source.`);
    }
  }

  for (const alternative of brief.existingAlternatives.items) {
    if (alternative.sourceIds.some((id) => !sourceIds.has(id))) {
      throw invalidModelResponse(`Alternative ${alternative.name} references an unknown source.`);
    }
    if (alternative.basis === "external_evidence" && alternative.sourceIds.length === 0) {
      throw invalidModelResponse(`Alternative ${alternative.name} requires a source.`);
    }
  }

  if (brief.evidence.status === "not_researched") {
    if (brief.evidence.sources.length > 0) {
      throw invalidModelResponse("A not-researched brief cannot contain external sources.");
    }
    if (brief.evidence.claims.some((claim) => claim.kind === "evidence")) {
      throw invalidModelResponse("A not-researched brief cannot contain evidence claims.");
    }
    if (brief.evidence.claims.some((claim) => claim.confidence === "high")) {
      throw invalidModelResponse("A not-researched brief cannot contain high-confidence claims.");
    }
    if (brief.targetUserAndProblem.evidenceBasis === "external_evidence") {
      throw invalidModelResponse(
        "A not-researched brief cannot use external evidence for the target-user claim."
      );
    }
    if (brief.existingAlternatives.status !== "not_researched") {
      throw invalidModelResponse(
        "A not-researched brief must mark alternatives as not researched."
      );
    }
    if (
      brief.existingAlternatives.items.some(
        (alternative) => alternative.basis === "external_evidence"
      )
    ) {
      throw invalidModelResponse(
        "A not-researched brief cannot present externally verified alternatives."
      );
    }
    if (brief.verdict.confidence === "high") {
      throw invalidModelResponse("A not-researched brief cannot claim high confidence.");
    }
    if (!brief.verdict.flags.includes("evidence_gap")) {
      throw invalidModelResponse("A not-researched brief must disclose an evidence gap.");
    }
  }

  if (!brief.followUpQuestion.question.endsWith("?")) {
    throw invalidModelResponse("The follow-up question must end with a question mark.");
  }
}

export function assertLiveExecutionEnabled(): void {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "sample") {
    throw new AppError(
      "Live model execution is disabled in this sample-only deployment.",
      { code: "LIVE_MODE_DISABLED", status: 403 }
    );
  }
}
