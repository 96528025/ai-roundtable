export type AgentName = string;

export type PanelMode = "startup" | "general";

export type PersonaAgent = {
  name: AgentName;
  description: string;
  focus: string;
};

export type DebateEntry = {
  round: number;
  agentName: string;
  content: string;
};

export type RoundtableSummary = {
  executiveSummary: string;
  consensus: string[];
  disagreements: string[];
  risks: string[];
  recommendedNextStep: string;
  followUpQuestion: string;
};

export type ModelCallMetric = {
  stage: string;
  attempt: number;
  status: "success" | "error";
  durationMs: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorCategory?: string;
  upstreamStatus?: number;
  requestId?: string;
  retryDelayMs?: number;
  stopReason?: string;
};

export type RunDiagnostics = {
  runId: string;
  startedAt: string;
  durationMs: number;
  modelCallCount: number;
  successfulModelCalls: number;
  failedModelCalls: number;
  retryCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  models: string[];
};

export type RoundtableResult = {
  agenda: string[];
  panelMode: PanelMode;
  summary: RoundtableSummary;
  transcript: DebateEntry[];
  diagnostics?: RunDiagnostics;
};

export type StoredMeeting = RoundtableResult & {
  id: string;
  idea: string;
  createdAt: string;
};

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};
