import type { ClaudeMessage } from "@/types";

const ANTHROPIC_VERSION = "2023-06-01";

type ClaudeOptions = {
  temperature?: number;
  maxTokens?: number;
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
  error?: {
    message?: string;
  };
};

export async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Create .env.local and add ANTHROPIC_API_KEY=your_key."
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 900
    })
  });

  const data = (await response.json().catch(() => ({}))) as AnthropicResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `Claude API request failed with ${response.status}.`);
  }

  const text = data.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude API returned an empty response.");
  }

  return text;
}
