import type { PanelMode } from "@/types";

export type EvaluationCase = {
  name: string;
  panelMode: PanelMode;
  idea: string;
  topics: string[];
};

export const evaluationCases: EvaluationCase[] = [
  {
    name: "consultant workflow",
    panelMode: "startup",
    idea:
      "An AI workspace that turns independent consultants' client calls into scoped proposals, follow-up tasks, and approval-ready project plans.",
    topics: ["Customer urgency", "Workflow integration", "MVP scope", "Pricing", "Validation plan"]
  },
  {
    name: "local chef subscriptions",
    panelMode: "startup",
    idea:
      "A marketplace where local chefs sell weekly meal subscriptions to nearby families who want home-cooked food without cooking every night.",
    topics: ["Buyer demand", "Chef supply", "Food safety", "Unit economics", "Launch market"]
  },
  {
    name: "shopping decision brief",
    panelMode: "startup",
    idea:
      "A browser extension that turns a shopper's open product tabs into a comparison and a decision brief based on their stated priorities.",
    topics: ["User pain", "Data extraction", "Trust", "Distribution", "Payment model"]
  },
  {
    name: "graduate program decision",
    panelMode: "general",
    idea:
      "I am deciding whether to accept a demanding graduate program while continuing part-time work and want a practical way to compare the tradeoffs.",
    topics: ["Desired outcome", "Time commitment", "Financial impact", "Career value", "Decision criteria"]
  },
  {
    name: "campus event organizer",
    panelMode: "startup",
    idea:
      "A lightweight tool that helps student club leaders turn event ideas into budgets, task owners, sponsor outreach, and attendee follow-up.",
    topics: ["Organizer pain", "Existing alternatives", "Activation", "Campus distribution", "Retention"]
  }
];
