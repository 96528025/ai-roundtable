import { panelLabel } from "@/lib/agents";
import { callClaude } from "@/lib/claude";
import {
  normalizePanelMode,
  normalizeTopics,
  parseRoundtableSummary,
  validateIdea
} from "@/lib/debate";
import { createRunObserver } from "@/lib/observability";
import type { RoundtableSummary, RunDiagnostics } from "@/types";

export type SinglePassResult = {
  summary: RoundtableSummary;
  diagnostics: RunDiagnostics;
};

export async function runSinglePass(
  ideaValue: unknown,
  topicsValue: unknown,
  panelModeValue: unknown
): Promise<SinglePassResult> {
  const observer = createRunObserver("single_pass_control");

  try {
    const idea = validateIdea(ideaValue);
    const topics = normalizeTopics(topicsValue);
    const panelMode = normalizePanelMode(panelModeValue);
    const raw = await callClaude(
      [
        {
          role: "user",
          content: `Analyze this idea directly in one response. Do not simulate a panel or invent a transcript.

Idea:
${idea}

Evaluation agenda:
${topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")}

Return only valid JSON with this exact shape:
{
  "executiveSummary": "string",
  "consensus": ["string"],
  "disagreements": ["string"],
  "risks": ["string"],
  "recommendedNextStep": "string",
  "followUpQuestion": "string"
}`
        }
      ],
      `You are a concise ${panelLabel(panelMode)} advisor.
Evaluate the idea without role-playing multiple agents.
Surface the strongest case for the idea, the strongest competing interpretation, material risks, and a measurable next step.
Return only the requested JSON.`,
      {
        temperature: 0.35,
        maxTokens: 1200,
        stage: "single_pass_synthesis",
        observer
      }
    );
    const summary = parseRoundtableSummary(raw);
    const diagnostics = observer.finish("success");

    return { summary, diagnostics };
  } catch (error) {
    observer.finish("error");
    throw error;
  }
}
