import type { PanelMode } from "@/types";

/**
 * Client-safe constants that define the observable fixed roundtable workflow.
 * Persona prompts and other server-only implementation details stay in
 * `lib/agents.ts`; response validation needs only these public names and rounds.
 */
export const ROUNDTABLE_ROUNDS = [1, 2, 3] as const;

type FiveAgentNames = readonly [string, string, string, string, string];

export const PANEL_AGENT_NAMES = {
  general: [
    "Critical Consumer",
    "Supportive Friend",
    "Conservative Elder",
    "Product Mentor",
    "Harsh Critic"
  ],
  startup: [
    "Customer Strategist",
    "Product Lead",
    "GTM Operator",
    "Operations & Risk Lead",
    "Financial Skeptic"
  ]
} as const satisfies Readonly<Record<PanelMode, FiveAgentNames>>;

/** Shared trimming, blank removal, and stable de-duplication for roundtable topics. */
export function normalizeRoundtableAgenda(topics: readonly string[]): string[] {
  return topics
    .map((topic) => topic.trim())
    .filter(Boolean)
    .filter((topic, index, all) => all.indexOf(topic) === index);
}
