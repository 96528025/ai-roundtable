import type { RunDiagnostics } from "@/types";

export type IdeaRequest = {
  idea: string;
  goal?: string;
  constraints: string[];
};

export type Unknown = {
  question: string;
  impact: "low" | "medium" | "high";
  answerableBy: "user" | "research" | "analysis";
  mayChangeVerdict: boolean;
};

export type RiskSignal =
  | "regulated_domain"
  | "sensitive_data"
  | "marketplace_operations"
  | "hardware_dependency"
  | "high_build_cost"
  | "high_ambiguity";

export type IdeaFrame = {
  summary: string;
  targetUser: string;
  problem: string;
  desiredOutcome: string;
  currentWorkaround: string;
  assumptions: string[];
  unknowns: Unknown[];
  riskSignals: RiskSignal[];
  routingSignals: {
    researchNeed: "low" | "medium" | "high";
    ambiguity: "low" | "medium" | "high";
    buildComplexity: "low" | "medium" | "high";
    deliberationValue: "low" | "medium" | "high";
  };
};

export type RouteReason =
  | "default_quick_path"
  | "high_build_complexity"
  | "high_risk"
  | "material_research_gap"
  | "high_ambiguity"
  | "material_tradeoffs";

export type RouteDecision = {
  selectedPath: "quick";
  fullRoundtableRecommended: boolean;
  reasonCodes: RouteReason[];
};

export type EvidenceSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
  accessedAt: string;
};

export type EvidenceClaim = {
  id: string;
  text: string;
  kind: "evidence" | "inference" | "assumption";
  sourceIds: string[];
  confidence: "low" | "medium" | "high";
};

export type Alternative = {
  name: string;
  category: string;
  relevance: string;
  basis: "user_input" | "inference" | "external_evidence";
  sourceIds: string[];
};

export type BriefRisk = {
  risk: string;
  type: "desirability" | "viability" | "feasibility" | "trust";
  assumption: string;
  cheapestTest: string;
};

export type ValidationStep = {
  days: string;
  action: string;
  evidenceToCollect: string;
  decisionThreshold: string;
};

export type VerdictDecision =
  | "proceed_to_mvp"
  | "validate_before_building"
  | "personal_or_portfolio"
  | "do_not_prioritize"
  | "insufficient_evidence";

export type VerdictFlag =
  | "weak_differentiation"
  | "no_clear_monetization"
  | "high_execution_risk"
  | "evidence_gap";

export type IdeaBrief = {
  schemaVersion: "2.0";
  mode: "quick" | "full";
  ideaSummary: string;
  verdict: {
    decision: VerdictDecision;
    confidence: "low" | "medium" | "high";
    rationale: string;
    flags: VerdictFlag[];
  };
  targetUserAndProblem: {
    targetUser: string;
    problem: string;
    currentWorkaround: string;
    evidenceBasis: "user_input" | "inference" | "external_evidence";
  };
  evidence: {
    status: "not_researched" | "limited" | "sufficient" | "conflicting";
    sources: EvidenceSource[];
    claims: EvidenceClaim[];
    unansweredQuestions: string[];
  };
  existingAlternatives: {
    status: "not_researched" | "partial" | "researched";
    items: Alternative[];
    researchTargets: string[];
  };
  differentiationOpportunities: string[];
  recommendedMvp: {
    productPromise: string;
    mustHave: string[];
    notNow: string[];
    successSignal: string;
  };
  platformRecommendation: {
    choice: "web" | "pwa" | "native_app" | "no_build_yet";
    rationale: string;
  };
  technicalApproach: {
    architecture: string;
    externalDependencies: string[];
    complexity: "low" | "medium" | "high";
    keyUnknowns: string[];
  };
  distribution: {
    firstUsers: string;
    channels: string[];
    activationMoment: string;
  };
  monetization: {
    outlook: "plausible" | "unclear" | "unlikely" | "not_required";
    rationale: string;
    validation: string;
  };
  biggestRisksAndAssumptions: BriefRisk[];
  validationPlan7Days: ValidationStep[];
  followUpQuestion: {
    question: string;
    whyItMatters: string;
    answerCouldChange: string;
  };
};

export type BudgetUsage = {
  maxCallAttempts: number;
  usedCallAttempts: number;
  retryAttempts: number;
  maxRequestedOutputTokens: number;
  requestedOutputTokens: number;
};

export type QuickBriefResult = {
  frame: IdeaFrame;
  planning: {
    status: "model" | "fallback";
  };
  route: RouteDecision;
  brief: IdeaBrief;
  budget: BudgetUsage;
  diagnostics: RunDiagnostics;
};

export type QuickBriefDisplayResult = Omit<
  QuickBriefResult,
  "budget" | "diagnostics"
> & {
  budget?: BudgetUsage;
  diagnostics?: RunDiagnostics;
};

export type DirectBriefResult = {
  brief: IdeaBrief;
  budget: BudgetUsage;
  diagnostics: RunDiagnostics;
};
