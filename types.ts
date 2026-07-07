export type AgentName =
  | "Critical Consumer"
  | "Supportive Friend"
  | "Conservative Elder"
  | "Product Mentor"
  | "Harsh Critic";

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

export type RoundtableResult = {
  summary: RoundtableSummary;
  transcript: DebateEntry[];
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
