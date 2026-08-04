import { AppError } from "@/lib/errors";
import type { RunObserver } from "@/lib/observability";
import type { ClaudeMessage } from "@/types";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 60_000;

export type ClaudeOptions = {
  temperature?: number;
  maxTokens?: number;
  stage?: string;
  observer?: RunObserver;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  model?: string;
  request_id?: string;
  content?: AnthropicTextBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
};

function configuredInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= minimum
    ? Math.min(numeric, maximum)
    : fallback;
}

function timeoutMs(): number {
  return configuredInteger(process.env.ANTHROPIC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 600_000);
}

function maxRetries(options: ClaudeOptions): number {
  return configuredInteger(
    options.maxRetries ?? process.env.ANTHROPIC_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
    0,
    5
  );
}

function retryBaseDelayMs(options: ClaudeOptions): number {
  return configuredInteger(
    options.retryBaseDelayMs ?? process.env.ANTHROPIC_RETRY_BASE_DELAY_MS,
    DEFAULT_RETRY_BASE_DELAY_MS,
    0,
    30_000
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds * 1_000), MAX_RETRY_DELAY_MS);
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }

  return undefined;
}

function retryDelayMs(
  attempt: number,
  retryAfter: number | undefined,
  options: ClaudeOptions
): number {
  if (retryAfter !== undefined) return retryAfter;

  const base = retryBaseDelayMs(options);
  const random = options.random ?? Math.random;
  const exponential = base * 2 ** Math.max(0, attempt - 1);
  const jitter = base > 0 ? Math.floor(random() * base) : 0;
  return Math.min(exponential + jitter, MAX_RETRY_DELAY_MS);
}

function wait(milliseconds: number, options: ClaudeOptions): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  if (options.sleep) return options.sleep(milliseconds);
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function upstreamError(
  status: number,
  requestId: string | undefined,
  retryAfter: number | undefined
): AppError {
  if (status === 429) {
    return new AppError("The AI service is rate-limited. Please try again shortly.", {
      code: "UPSTREAM_RATE_LIMIT",
      status: 429,
      retryable: true,
      requestId,
      retryAfterMs: retryAfter
    });
  }

  if (status === 504) {
    return new AppError("The AI service timed out. Please try again.", {
      code: "UPSTREAM_TIMEOUT",
      status: 504,
      retryable: true,
      requestId,
      retryAfterMs: retryAfter
    });
  }

  if (status === 529) {
    return new AppError("The AI service is temporarily overloaded. Please try again shortly.", {
      code: "UPSTREAM_OVERLOADED",
      status: 503,
      retryable: true,
      requestId,
      retryAfterMs: retryAfter
    });
  }

  if (status >= 500) {
    return new AppError("The AI service returned a temporary error. Please try again.", {
      code: "UPSTREAM_FAILURE",
      status: 502,
      retryable: true,
      requestId,
      retryAfterMs: retryAfter
    });
  }

  if (status === 401 || status === 402 || status === 403 || status === 404) {
    return new AppError("The AI service configuration could not be authenticated.", {
      code: "UPSTREAM_AUTHENTICATION",
      status: 502,
      requestId
    });
  }

  return new AppError("The AI service rejected the generated request.", {
    code: "UPSTREAM_FAILURE",
    status: 502,
    requestId
  });
}

function networkError(error: unknown, timedOut: boolean): AppError {
  return timedOut
    ? new AppError(`The AI service did not respond within ${timeoutMs()}ms.`, {
        code: "UPSTREAM_TIMEOUT",
        status: 504,
        retryable: true,
        cause: error
      })
    : new AppError("The AI service could not be reached. Please try again.", {
        code: "UPSTREAM_NETWORK",
        status: 502,
        retryable: true,
        cause: error
      });
}

function errorCategory(error: AppError): string {
  return error.code.toLowerCase();
}

export async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
  const stage = options.stage || "unspecified";

  if (!apiKey) {
    const error = new AppError(
      "The AI service is not configured. Add ANTHROPIC_API_KEY to the server environment.",
      { code: "SERVICE_CONFIGURATION", status: 503 }
    );
    options.observer?.record({
      stage,
      attempt: 1,
      status: "error",
      durationMs: 0,
      model,
      errorCategory: errorCategory(error)
    });
    throw error;
  }

  const retries = maxRetries(options);

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs());
    let response: Response;

    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
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
        }),
        signal: controller.signal
      });
    } catch (caughtError) {
      const error = networkError(caughtError, controller.signal.aborted);
      const shouldRetry = error.retryable && attempt <= retries;
      const delay = shouldRetry ? retryDelayMs(attempt, undefined, options) : undefined;
      options.observer?.record({
        stage,
        attempt,
        status: "error",
        durationMs: Date.now() - startedAt,
        model,
        errorCategory: errorCategory(error),
        retryDelayMs: delay
      });
      clearTimeout(timeout);

      if (shouldRetry) {
        await wait(delay ?? 0, options);
        continue;
      }

      throw error;
    }

    clearTimeout(timeout);
    const data = (await response.json().catch(() => ({}))) as AnthropicResponse;
    const requestId = response.headers.get("request-id") || data.request_id;

    if (!response.ok) {
      const serverRetryAfter = parseRetryAfter(response.headers.get("retry-after"));
      const error = upstreamError(response.status, requestId, serverRetryAfter);
      const shouldRetry = error.retryable && attempt <= retries;
      const delay = shouldRetry
        ? retryDelayMs(attempt, serverRetryAfter, options)
        : undefined;
      options.observer?.record({
        stage,
        attempt,
        status: "error",
        durationMs: Date.now() - startedAt,
        model: data.model || model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        errorCategory: errorCategory(error),
        upstreamStatus: response.status,
        requestId,
        retryDelayMs: delay
      });

      if (shouldRetry) {
        await wait(delay ?? 0, options);
        continue;
      }

      throw error;
    }

    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      const error = new AppError("The AI service returned an unusable empty response.", {
        code: "INVALID_MODEL_RESPONSE",
        status: 502,
        requestId
      });
      options.observer?.record({
        stage,
        attempt,
        status: "error",
        durationMs: Date.now() - startedAt,
        model: data.model || model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        errorCategory: errorCategory(error),
        requestId
      });
      throw error;
    }

    options.observer?.record({
      stage,
      attempt,
      status: "success",
      durationMs: Date.now() - startedAt,
      model: data.model || model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      requestId
    });

    return text;
  }

  throw new AppError("The AI service failed after all retry attempts.", {
    code: "UPSTREAM_FAILURE",
    status: 502
  });
}
