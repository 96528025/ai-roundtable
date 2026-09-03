import { IDEA_MAX_CHARACTERS, TOPIC_MAX_CHARACTERS } from "@/lib/limits";
import {
  normalizeRoundtableAgenda,
  PANEL_AGENT_NAMES,
  ROUNDTABLE_ROUNDS
} from "@/lib/roundtable-contract";
import type {
  Alternative,
  BriefRisk,
  BudgetUsage,
  EvidenceClaim,
  EvidenceSource,
  IdeaBrief,
  IdeaFrame,
  QuickBriefDisplayResult,
  QuickBriefResult,
  RiskSignal,
  RouteDecision,
  RouteReason,
  Unknown,
  ValidationStep,
  VerdictDecision,
  VerdictFlag
} from "@/lib/v2/types";
import type {
  DebateEntry,
  PanelMode,
  RoundtableResult,
  RoundtableSummary,
  RunDiagnostics
} from "@/types";

/**
 * Pure, environment-free parsers for every JSON contract the UI renders.
 *
 * The server uses these to validate model output before responding; the
 * browser uses the same functions to validate 2xx bodies before anything is
 * rendered. Nothing here touches process.env, credentials, or the network, so
 * the module is safe to ship in the client bundle. Failures throw
 * ContractSchemaError with a field path in the message and never echo the
 * offending value.
 */
export class ContractSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractSchemaError";
  }
}

function fail(message: string): never {
  throw new ContractSchemaError(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 1_200): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be non-empty text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    fail(`${label} is too long.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, label, maximum);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${label} has an unsupported value.`);
  }
  return value as T;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${label} must be a boolean.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`);
  }
  return value;
}

function nullableNonNegativeInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  return nonNegativeInteger(value, label);
}

function array<T>(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  parseItem: (item: unknown, index: number) => T
): T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${label} must contain ${minimum} to ${maximum} items.`);
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

const levels = ["low", "medium", "high"] as const;

function parseUnknown(value: unknown, index: number): Unknown {
  const item = record(value, `unknowns[${index}]`);
  return {
    question: text(item.question, `unknowns[${index}].question`, 400),
    impact: oneOf(item.impact, levels, `unknowns[${index}].impact`),
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

export function parseIdeaFrameValue(input: unknown): IdeaFrame {
  const value = record(input, "IdeaFrame");
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
      researchNeed: oneOf(routing.researchNeed, levels, "routingSignals.researchNeed"),
      ambiguity: oneOf(routing.ambiguity, levels, "routingSignals.ambiguity"),
      buildComplexity: oneOf(
        routing.buildComplexity,
        levels,
        "routingSignals.buildComplexity"
      ),
      deliberationValue: oneOf(
        routing.deliberationValue,
        levels,
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
    fail(`sources[${index}].url must be an HTTP URL.`);
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
    kind: oneOf(item.kind, ["evidence", "inference", "assumption"], `claims[${index}].kind`),
    sourceIds: textArray(item.sourceIds, `claims[${index}].sourceIds`, 0, 5, 80),
    confidence: oneOf(item.confidence, levels, `claims[${index}].confidence`)
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
    assumption: text(item.assumption, `biggestRisksAndAssumptions[${index}].assumption`, 500),
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

export function parseIdeaBriefValue(input: unknown): IdeaBrief {
  const value = record(input, "IdeaBrief");
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
      confidence: oneOf(verdict.confidence, levels, "verdict.confidence"),
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
      items: array(alternatives.items, "existingAlternatives.items", 0, 5, parseAlternative),
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
      complexity: oneOf(technical.complexity, levels, "technicalApproach.complexity"),
      keyUnknowns: textArray(technical.keyUnknowns, "technicalApproach.keyUnknowns", 1, 4, 400)
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
    fail("Evidence source IDs must be unique.");
  }
  const claimIds = new Set(brief.evidence.claims.map((claim) => claim.id));
  if (claimIds.size !== brief.evidence.claims.length) {
    fail("Evidence claim IDs must be unique.");
  }

  for (const claim of brief.evidence.claims) {
    if (claim.sourceIds.some((id) => !sourceIds.has(id))) {
      fail(`Evidence claim ${claim.id} references an unknown source.`);
    }
    if (claim.kind === "evidence" && claim.sourceIds.length === 0) {
      fail(`Evidence claim ${claim.id} requires a source.`);
    }
  }

  for (const alternative of brief.existingAlternatives.items) {
    if (alternative.sourceIds.some((id) => !sourceIds.has(id))) {
      fail(`Alternative ${alternative.name} references an unknown source.`);
    }
    if (alternative.basis === "external_evidence" && alternative.sourceIds.length === 0) {
      fail(`Alternative ${alternative.name} requires a source.`);
    }
  }

  if (brief.evidence.status === "not_researched") {
    if (brief.evidence.sources.length > 0) {
      fail("A not-researched brief cannot contain external sources.");
    }
    if (brief.evidence.claims.some((claim) => claim.kind === "evidence")) {
      fail("A not-researched brief cannot contain evidence claims.");
    }
    if (brief.evidence.claims.some((claim) => claim.confidence === "high")) {
      fail("A not-researched brief cannot contain high-confidence claims.");
    }
    if (brief.targetUserAndProblem.evidenceBasis === "external_evidence") {
      fail("A not-researched brief cannot use external evidence for the target-user claim.");
    }
    if (brief.existingAlternatives.status !== "not_researched") {
      fail("A not-researched brief must mark alternatives as not researched.");
    }
    if (
      brief.existingAlternatives.items.some(
        (alternative) => alternative.basis === "external_evidence"
      )
    ) {
      fail("A not-researched brief cannot present externally verified alternatives.");
    }
    if (brief.verdict.confidence === "high") {
      fail("A not-researched brief cannot claim high confidence.");
    }
    if (!brief.verdict.flags.includes("evidence_gap")) {
      fail("A not-researched brief must disclose an evidence gap.");
    }
  }

  if (!brief.followUpQuestion.question.endsWith("?")) {
    fail("The follow-up question must end with a question mark.");
  }
}

/**
 * Milestone 1 Quick Brief semantics. The generic IdeaBrief contract also
 * describes researched briefs; a Quick Brief is written without external
 * research and the interface says so, so its mode and evidence status are
 * fixed. `not_researched` in turn activates the integrity rules above: no
 * sources, no evidence claims, no high confidence, an explicit evidence gap.
 */
export function assertQuickBriefSemantics(brief: IdeaBrief): IdeaBrief {
  if (brief.mode !== "quick") {
    fail("A Quick Brief must use mode quick.");
  }
  if (brief.evidence.status !== "not_researched") {
    fail("A Quick Brief must report evidence.status not_researched.");
  }
  return brief;
}

export function parseQuickIdeaBriefValue(input: unknown): IdeaBrief {
  return assertQuickBriefSemantics(parseIdeaBriefValue(input));
}

const routeReasons: readonly RouteReason[] = [
  "default_quick_path",
  "high_build_complexity",
  "high_risk",
  "material_research_gap",
  "high_ambiguity",
  "material_tradeoffs"
];

export function parseRouteDecisionValue(input: unknown): RouteDecision {
  const value = record(input, "route");
  return {
    selectedPath: oneOf(value.selectedPath, ["quick"], "route.selectedPath"),
    fullRoundtableRecommended: booleanValue(
      value.fullRoundtableRecommended,
      "route.fullRoundtableRecommended"
    ),
    reasonCodes: array(value.reasonCodes, "route.reasonCodes", 0, 6, (item, index) =>
      oneOf(item, routeReasons, `route.reasonCodes[${index}]`)
    )
  };
}

export function parseBudgetUsageValue(input: unknown): BudgetUsage {
  const value = record(input, "budget");
  return {
    maxCallAttempts: nonNegativeInteger(value.maxCallAttempts, "budget.maxCallAttempts"),
    usedCallAttempts: nonNegativeInteger(value.usedCallAttempts, "budget.usedCallAttempts"),
    retryAttempts: nonNegativeInteger(value.retryAttempts, "budget.retryAttempts"),
    maxRequestedOutputTokens: nonNegativeInteger(
      value.maxRequestedOutputTokens,
      "budget.maxRequestedOutputTokens"
    ),
    requestedOutputTokens: nonNegativeInteger(
      value.requestedOutputTokens,
      "budget.requestedOutputTokens"
    )
  };
}

export function parseRunDiagnosticsValue(input: unknown): RunDiagnostics {
  const value = record(input, "diagnostics");
  return {
    runId: text(value.runId, "diagnostics.runId", 120),
    startedAt: text(value.startedAt, "diagnostics.startedAt", 40),
    durationMs: nonNegativeInteger(value.durationMs, "diagnostics.durationMs"),
    modelCallCount: nonNegativeInteger(value.modelCallCount, "diagnostics.modelCallCount"),
    successfulModelCalls: nonNegativeInteger(
      value.successfulModelCalls,
      "diagnostics.successfulModelCalls"
    ),
    failedModelCalls: nonNegativeInteger(value.failedModelCalls, "diagnostics.failedModelCalls"),
    retryCount: nonNegativeInteger(value.retryCount, "diagnostics.retryCount"),
    inputTokens: nullableNonNegativeInteger(value.inputTokens, "diagnostics.inputTokens"),
    outputTokens: nullableNonNegativeInteger(value.outputTokens, "diagnostics.outputTokens"),
    models: textArray(value.models, "diagnostics.models", 0, 20, 200)
  };
}

function parseQuickBriefCore(value: Record<string, unknown>) {
  const planning = record(value.planning, "planning");
  return {
    frame: parseIdeaFrameValue(value.frame),
    planning: {
      status: oneOf(planning.status, ["model", "fallback"], "planning.status")
    },
    route: parseRouteDecisionValue(value.route),
    brief: parseQuickIdeaBriefValue(value.brief)
  };
}

/** A /api/brief success body. The endpoint always reports budget and diagnostics. */
export function parseQuickBriefApiResponseValue(input: unknown): QuickBriefResult {
  const value = record(input, "QuickBriefResult");
  return {
    ...parseQuickBriefCore(value),
    budget: parseBudgetUsageValue(value.budget),
    diagnostics: parseRunDiagnosticsValue(value.diagnostics)
  };
}

/**
 * A displayable Quick Brief such as the shipped sample, which has no run
 * budget or diagnostics. Both are validated when present.
 */
export function parseQuickBriefDisplayValue(input: unknown): QuickBriefDisplayResult {
  const value = record(input, "QuickBriefDisplayResult");
  const result: QuickBriefDisplayResult = parseQuickBriefCore(value);
  if (value.budget !== undefined && value.budget !== null) {
    result.budget = parseBudgetUsageValue(value.budget);
  }
  if (value.diagnostics !== undefined && value.diagnostics !== null) {
    result.diagnostics = parseRunDiagnosticsValue(value.diagnostics);
  }
  return result;
}

const panelModes: readonly PanelMode[] = ["startup", "general"];

export type AgendaResponse = {
  idea: string;
  panelMode: PanelMode;
  topics: string[];
};

export type AgendaResponseExpectation = Pick<AgendaResponse, "idea" | "panelMode">;

/** A /api/agenda success body. Diagnostics are not part of the display contract and are ignored. */
export function parseAgendaResponseValue(input: unknown): AgendaResponse {
  const value = record(input, "AgendaResponse");
  return {
    idea: text(value.idea, "idea", IDEA_MAX_CHARACTERS),
    panelMode: oneOf(value.panelMode, panelModes, "panelMode"),
    topics: textArray(value.topics, "topics", 3, 5, TOPIC_MAX_CHARACTERS)
  };
}

/** Parse an agenda endpoint response and bind its request echoes to this request. */
export function parseAgendaApiResponseValue(
  input: unknown,
  expected: AgendaResponseExpectation
): AgendaResponse {
  const result = parseAgendaResponseValue(input);
  if (result.idea !== expected.idea.trim()) {
    fail("AgendaResponse.idea does not match the request.");
  }
  if (result.panelMode !== expected.panelMode) {
    fail("AgendaResponse.panelMode does not match the request.");
  }
  return result;
}

/** Shared structural contract for model output and rendered roundtable summaries. */
export function parseRoundtableSummaryValue(input: unknown): RoundtableSummary {
  const value = record(input, "summary");
  return {
    executiveSummary: text(value.executiveSummary, "summary.executiveSummary", 5_000),
    consensus: textArray(value.consensus, "summary.consensus", 0, 20, 2_000),
    disagreements: textArray(value.disagreements, "summary.disagreements", 0, 20, 2_000),
    risks: textArray(value.risks, "summary.risks", 0, 20, 2_000),
    recommendedNextStep: text(value.recommendedNextStep, "summary.recommendedNextStep", 2_000),
    followUpQuestion: text(value.followUpQuestion, "summary.followUpQuestion", 2_000)
  };
}

function parseDebateEntry(value: unknown, index: number): DebateEntry {
  const item = record(value, `transcript[${index}]`);
  return {
    round: nonNegativeInteger(item.round, `transcript[${index}].round`),
    agentName: text(item.agentName, `transcript[${index}].agentName`, 200),
    content: text(item.content, `transcript[${index}].content`, 20_000)
  };
}

function sameTextItems(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((item, index) => item === expected[index])
  );
}

function parseFixedRoundtableTranscript(input: unknown, panelMode: PanelMode): DebateEntry[] {
  const expectedAgentNames: readonly string[] = PANEL_AGENT_NAMES[panelMode];
  const expectedTurnCount = ROUNDTABLE_ROUNDS.length * expectedAgentNames.length;
  const transcript = array(
    input,
    "transcript",
    expectedTurnCount,
    expectedTurnCount,
    parseDebateEntry
  );
  for (const [index, entry] of transcript.entries()) {
    const expectedRound = ROUNDTABLE_ROUNDS[Math.floor(index / expectedAgentNames.length)];
    const expectedAgentName = expectedAgentNames[index % expectedAgentNames.length];
    if (entry.round !== expectedRound || entry.agentName !== expectedAgentName) {
      fail("transcript does not match the fixed round-agent order.");
    }
  }

  return transcript;
}

export type RoundtableApiResponse = Omit<RoundtableResult, "diagnostics"> & {
  diagnostics: RunDiagnostics;
};

export type RoundtableResponseExpectation = {
  agenda: readonly string[];
  panelMode: PanelMode;
};

/** A /api/roundtable success body bound to the request and fixed workflow. */
export function parseRoundtableApiResponseValue(
  input: unknown,
  expected: RoundtableResponseExpectation
): RoundtableApiResponse {
  const value = record(input, "RoundtableApiResponse");
  const agenda = textArray(value.agenda, "agenda", 3, 5, TOPIC_MAX_CHARACTERS);
  const panelMode = oneOf(value.panelMode, panelModes, "panelMode");

  if (!sameTextItems(agenda, normalizeRoundtableAgenda(expected.agenda))) {
    fail("RoundtableApiResponse.agenda does not match the request.");
  }
  if (panelMode !== expected.panelMode) {
    fail("RoundtableApiResponse.panelMode does not match the request.");
  }

  return {
    agenda,
    panelMode,
    summary: parseRoundtableSummaryValue(value.summary),
    transcript: parseFixedRoundtableTranscript(value.transcript, panelMode),
    diagnostics: parseRunDiagnosticsValue(value.diagnostics)
  };
}

/** A displayable roundtable sample; diagnostics and fixed-workflow checks are optional. */
export function parseRoundtableDisplayValue(input: unknown): RoundtableResult {
  const value = record(input, "RoundtableDisplayResult");
  const result: RoundtableResult = {
    agenda: textArray(value.agenda, "agenda", 3, 5, TOPIC_MAX_CHARACTERS),
    panelMode: oneOf(value.panelMode, panelModes, "panelMode"),
    summary: parseRoundtableSummaryValue(value.summary),
    transcript: array(value.transcript, "transcript", 1, 100, parseDebateEntry)
  };
  if (value.diagnostics !== undefined && value.diagnostics !== null) {
    result.diagnostics = parseRunDiagnosticsValue(value.diagnostics);
  }
  return result;
}
