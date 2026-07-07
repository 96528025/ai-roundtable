import { personaAgents } from "@/lib/agents";
import { callClaude } from "@/lib/claude";
import type { DebateEntry, PersonaAgent, RoundtableResult, RoundtableSummary } from "@/types";

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

async function createDiscussionTopics(idea: string): Promise<string[]> {
  const raw = await callClaude(
    [
      {
        role: "user",
        content: `Break this idea into 3 to 5 concrete discussion topics for the roundtable.\n\nIdea:\n${idea}\n\nReturn only a JSON array of strings.`
      }
    ],
    "You are a concise moderator who prepares agenda topics for practical debate. Return only valid JSON.",
    { temperature: 0.3, maxTokens: 350 }
  );

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((topic) => typeof topic === "string")) {
      return parsed.slice(0, 5);
    }
  } catch {
    // Fall through to the default agenda.
  }

  return ["Audience demand", "Differentiation", "MVP scope", "Risks", "Next validation step"];
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
  transcript: DebateEntry[]
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
    { temperature: 0.65, maxTokens: 500 }
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
    throw new Error("Moderator did not return a JSON object.");
  }

  return raw.slice(start, end + 1);
}

function validateSummary(value: unknown): RoundtableSummary {
  const summary = value as Partial<RoundtableSummary>;

  if (
    typeof summary.executiveSummary !== "string" ||
    !Array.isArray(summary.consensus) ||
    !Array.isArray(summary.disagreements) ||
    !Array.isArray(summary.risks) ||
    typeof summary.recommendedNextStep !== "string" ||
    typeof summary.followUpQuestion !== "string"
  ) {
    throw new Error("Moderator summary was not in the expected shape.");
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
  transcript: DebateEntry[]
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
    { temperature: 0.35, maxTokens: 1200 }
  );

  return validateSummary(JSON.parse(extractJsonObject(raw)));
}

export async function runRoundtable(idea: string): Promise<RoundtableResult> {
  const trimmedIdea = idea.trim();

  if (trimmedIdea.length < 10) {
    throw new Error("Please enter a more specific idea before convening the roundtable.");
  }

  const topics = await createDiscussionTopics(trimmedIdea);
  const transcript: DebateEntry[] = [];

  for (const round of [1, 2, 3]) {
    for (const agent of personaAgents) {
      const entry = await runAgentTurn(agent, trimmedIdea, topics, round, transcript);
      transcript.push(entry);
    }
  }

  const summary = await synthesizeSummary(trimmedIdea, topics, transcript);

  return {
    summary,
    transcript
  };
}
