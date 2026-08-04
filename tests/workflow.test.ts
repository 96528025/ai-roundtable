import { afterEach, describe, expect, it, vi } from "vitest";
import { getPersonaAgents, panelLabel } from "@/lib/agents";
import { IDEA_MAX_CHARACTERS } from "@/lib/limits";
import {
  createDiscussionTopics,
  normalizePanelMode,
  normalizeTopics,
  validateIdea
} from "@/lib/debate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("panel configuration", () => {
  it("defaults unknown input to the startup panel", () => {
    expect(normalizePanelMode("unexpected")).toBe("startup");
    expect(panelLabel("startup")).toBe("Startup Validation");
  });

  it("exposes five distinct specialists for each panel", () => {
    const startupNames = getPersonaAgents("startup").map((agent) => agent.name);
    const generalNames = getPersonaAgents("general").map((agent) => agent.name);

    expect(new Set(startupNames).size).toBe(5);
    expect(new Set(generalNames).size).toBe(5);
    expect(startupNames).toContain("GTM Operator");
    expect(generalNames).toContain("Critical Consumer");
  });
});

describe("human-approved agenda validation", () => {
  it("trims an idea and rejects underspecified input", () => {
    expect(validateIdea("  A sufficiently specific company idea  ")).toBe(
      "A sufficiently specific company idea"
    );
    expect(() => validateIdea("too short")).toThrow(/more specific idea/i);
  });

  it("caps idea length before the text can be repeated across model calls", () => {
    expect(validateIdea("A".repeat(IDEA_MAX_CHARACTERS))).toHaveLength(
      IDEA_MAX_CHARACTERS
    );
    expect(() => validateIdea("A".repeat(IDEA_MAX_CHARACTERS + 1))).toThrow(
      /under 5,000 characters/i
    );
  });

  it("normalizes approved topics while preserving order", () => {
    expect(normalizeTopics(["  Demand  ", "MVP", "Risks"])).toEqual([
      "Demand",
      "MVP",
      "Risks"
    ]);
  });

  it("requires three to five distinct non-empty topics", () => {
    expect(() => normalizeTopics(["Demand", "Demand", "Risks"])).toThrow(/3 to 5/);
    expect(() => normalizeTopics(["One", "Two", "Three", "Four", "Five", "Six"])).toThrow(
      /3 to 5/
    );
  });

  it("rejects agenda topics that exceed the UI contract", () => {
    expect(() => normalizeTopics(["A".repeat(161), "MVP", "Risks"])).toThrow(
      /under 160 characters/
    );
  });

  it("falls back to an editable startup agenda when no API key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await expect(
      createDiscussionTopics(
        "A marketplace where local chefs sell weekly subscriptions to nearby families.",
        "startup"
      )
    ).resolves.toEqual([
      "Audience demand",
      "Differentiation",
      "MVP scope",
      "Risks",
      "Next validation step"
    ]);
  });
});
