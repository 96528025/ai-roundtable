import { getPersonaAgents, panelLabel } from "@/lib/agents";
import { callClaude } from "@/lib/claude";
import { AppError, invalidRequest } from "@/lib/errors";
import {
  IDEA_MAX_CHARACTERS,
  IDEA_MIN_CHARACTERS,
  TOPIC_MAX_CHARACTERS
} from "@/lib/limits";
import { createRunObserver, type RunObserver } from "@/lib/observability";
import type {
  DebateEntry,
  PanelMode,
  PersonaAgent,
  RoundtableResult,
  RoundtableSummary
} from "@/types";

const defaultAgenda = [
  "Audience demand",
  "Differentiation",
  "MVP scope",
  "Risks",
  "Next validation step"
];

function fallbackAgenda(panelMode: PanelMode): string[] {
  return panelMode === "startup"
    ? [...defaultAgenda]
    : ["Desired outcome", "Benefits", "Tradeoffs", "Risks", "Next practical step"];
}

function transcriptText(transcript: DebateEntry[]): string {
  if (transcript.length === 0) {
    return "No prior discussion yet.";
  }

  return transcript
    .map((entry) => `Round ${entry.round} - ${entry.agentName}: ${entry.content}`)
    .join("\n\n");
}

function agentSystemPrompt(agent: PersonaAgent): string {
  return `You are ${agent.name} in a private advisory roundtable.
Persona: ${agent.description}
Primary focus: ${agent.focus}

Rules:
- Speak in first person as this persona.
- Be concise but specific.
- Do not produce a final summary for the user.
- Do not mention that you are an AI model.
- Treat this as a private meeting transcript.
- In rounds 2 and 3, explicitly engage with at least one prior agent by name.`;
}

export function normalizePanelMode(value: unknown): PanelMode {
  return value === "general" ? "general" : "startup";
}

export function validateIdea(value: unknown): string {
  const idea = typeof value === "string" ? value.trim() : "";

  if (idea.length < IDEA_MIN_CHARACTERS) {
    throw invalidRequest(
      "Please enter a more specific idea before preparing the roundtable.",
      "INVALID_IDEA"
    );
  }

  if (idea.length > IDEA_MAX_CHARACTERS) {
    throw invalidRequest(
      `Keep the idea under ${IDEA_MAX_CHARACTERS.toLocaleString("en-US")} characters to control model cost and context size.`,
      "INVALID_IDEA"
    );
  }

  return idea;
}

export function normalizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw invalidRequest(
      "Prepare and approve an agenda before convening the roundtable.",
      "INVALID_AGENDA"
    );
  }

  const topics = value
    .filter((topic): topic is string => typeof topic === "string")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .filter((topic, index, all) => all.indexOf(topic) === index);

  if (topics.length < 3 || topics.length > 5) {
    throw invalidRequest(
      "The approved agenda must contain 3 to 5 distinct topics.",
      "INVALID_AGENDA"
    );
  }

  if (topics.some((topic) => topic.length > TOPIC_MAX_CHARACTERS)) {
    throw invalidRequest(
      `Keep each agenda topic under ${TOPIC_MAX_CHARACTERS} characters.`,
      "INVALID_AGENDA"
    );
  }

  return topics;
}

export async function createDiscussionTopics(
  ideaValue: unknown,
  panelModeValue: unknown,
  observer?: RunObserver
): Promise<string[]> {
  const idea = validateIdea(ideaValue);
  const panelMode = normalizePanelMode(panelModeValue);
  const panel = panelLabel(panelMode);
  let raw: string;
  try {
    raw = await callClaude(
      [
        {
          role: "user",
          content: `Break this idea into 3 to 5 concrete discussion topics for a ${panel} roundtable.\n\nIdea:\n${idea}\n\nChoose topics that could materially change the decision. Return only a JSON array of strings.`
        }
      ],
      "You are a concise moderator who prepares agenda topics for practical debate. Return only valid JSON.",
      { temperature: 0.3, maxTokens: 350, stage: "agenda_generation", observer }
    );
  } catch {
    return fallbackAgenda(panelMode);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((topic) => typeof topic === "string")) {
      const topics = parsed.slice(0, 5).map((topic) => topic.trim()).filter(Boolean);
      if (topics.length >= 3) {
        return topics;
      }
    }
  } catch {
    // Fall through to the default agenda.
  }

  return fallbackAgenda(panelMode);
}

function roundInstruction(round: number): string {
  if (round === 1) {
    return "Round 1: Give your initial position on the idea. State what seems promising and what worries you most.";
  }

  if (round === 2) {
    return "Round 2: Cross-response. Respond to at least one prior agent by name. Explicitly agree, disagree, or refine their claim, then add your own updated point.";
  }

  return "Round 3: Final stance. After hearing the others, give your revised opinion and one concrete recommendation from your persona.";
}

async function runAgentTurn(
  agent: PersonaAgent,
  idea: string,
  topics: string[],
  round: number,
  transcript: DebateEntry[],
  observer: RunObserver
): Promise<DebateEntry> {
  const content = await callClaude(
    [
      {
        role: "user",
        content: `User idea:
${idea}

Moderator agenda:
${topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")}

Discussion so far:
${transcriptText(transcript)}

${roundInstruction(round)}

Keep your response to 120-180 words.`
      }
    ],
    agentSystemPrompt(agent),
    {
      temperature: 0.65,
      maxTokens: 500,
      stage: `round_${round}.${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      observer
    }
  );

  return {
    round,
    agentName: agent.name,
    content
  };
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new AppError("The moderator returned an invalid report format.", {
      code: "INVALID_MODEL_RESPONSE",
      status: 502
    });
  }

  return raw.slice(start, end + 1);
}

export function parseRoundtableSummary(raw: string): RoundtableSummary {
  try {
    return validateSummary(JSON.parse(extractJsonObject(raw)));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("The moderator returned invalid JSON.", {
      code: "INVALID_MODEL_RESPONSE",
      status: 502,
      cause: error
    });
  }
}

function validateSummary(value: unknown): RoundtableSummary {
  const summary =
    typeof value === "object" && value !== null
      ? (value as Partial<RoundtableSummary>)
      : {};

  if (
    typeof summary.executiveSummary !== "string" ||
    !Array.isArray(summary.consensus) ||
    !Array.isArray(summary.disagreements) ||
    !Array.isArray(summary.risks) ||
    typeof summary.recommendedNextStep !== "string" ||
    typeof summary.followUpQuestion !== "string"
  ) {
    throw new AppError("The moderator returned an incomplete report.", {
      code: "INVALID_MODEL_RESPONSE",
      status: 502
    });
  }

  return {
    executiveSummary: summary.executiveSummary,
    consensus: summary.consensus.map(String),
    disagreements: summary.disagreements.map(String),
    risks: summary.risks.map(String),
    recommendedNextStep: summary.recommendedNextStep,
    followUpQuestion: summary.followUpQuestion
  };
}

async function synthesizeSummary(
  idea: string,
  topics: string[],
  transcript: DebateEntry[],
  observer: RunObserver
): Promise<RoundtableSummary> {
  const raw = await callClaude(
    [
      {
        role: "user",
        content: `The private roundtable has finished.

Original user idea:
${idea}

Moderator agenda:
${topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")}

Full internal transcript:
${transcriptText(transcript)}

Produce the final report for the user. Return only valid JSON with this exact shape:
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
    `You are the AI Roundtable moderator.
You synthesize the private debate into a clear, structured report.
The user should see your final summary first, not raw agent output.
Be decisive and concrete. Include the strongest disagreement instead of smoothing everything over.`,
    { temperature: 0.35, maxTokens: 1200, stage: "moderator_synthesis", observer }
  );

  return parseRoundtableSummary(raw);
}

export async function runRoundtable(
  ideaValue: unknown,
  topicsValue: unknown,
  panelModeValue: unknown
): Promise<RoundtableResult> {
  const observer = createRunObserver("roundtable");

  try {
    const trimmedIdea = validateIdea(ideaValue);
    const topics = normalizeTopics(topicsValue);
    const panelMode = normalizePanelMode(panelModeValue);
    const personaAgents = getPersonaAgents(panelMode);
    const transcript: DebateEntry[] = [];

    for (const round of [1, 2, 3]) {
      for (const agent of personaAgents) {
        const entry = await runAgentTurn(
          agent,
          trimmedIdea,
          topics,
          round,
          transcript,
          observer
        );
        transcript.push(entry);
      }
    }

    const summary = await synthesizeSummary(trimmedIdea, topics, transcript, observer);
    const diagnostics = observer.finish("success");

    return {
      agenda: topics,
      panelMode,
      summary,
      transcript,
      diagnostics
    };
  } catch (error) {
    observer.finish("error");
    throw error;
  }
}
