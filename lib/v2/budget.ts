import { callClaude, type ClaudeOptions } from "@/lib/claude";
import { AppError } from "@/lib/errors";
import type { RunObserver } from "@/lib/observability";
import type { BudgetUsage } from "@/lib/v2/types";
import type { ClaudeMessage } from "@/types";

type BudgetedCallOptions = Omit<
  ClaudeOptions,
  "maxRetries" | "maxTokens" | "observer" | "stage"
> & {
  stage: string;
  maxTokens: number;
  reserveAttempts?: number;
};

type ModelBudgetOptions = {
  maxCallAttempts: number;
  maxRequestedOutputTokens: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function budgetExhausted(message: string): AppError {
  return new AppError(message, {
    code: "BUDGET_EXHAUSTED",
    status: 503
  });
}

export class ModelBudget {
  private requestedOutputTokens = 0;
  private retryAttempts = 0;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly observer: RunObserver,
    private readonly options: ModelBudgetOptions
  ) {
    this.sleep = options.sleep ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async call(
    messages: ClaudeMessage[],
    systemPrompt: string,
    options: BudgetedCallOptions
  ): Promise<string> {
    const reserveAttempts = options.reserveAttempts ?? 0;
    let localAttempt = 0;

    while (true) {
      const usedAttempts = this.observer.snapshot().modelCallCount;
      if (usedAttempts >= this.options.maxCallAttempts - reserveAttempts) {
        throw budgetExhausted("The Quick Brief model-call budget was exhausted.");
      }
      if (
        this.requestedOutputTokens + options.maxTokens >
        this.options.maxRequestedOutputTokens
      ) {
        throw budgetExhausted("The Quick Brief output-token budget was exhausted.");
      }

      localAttempt += 1;
      this.requestedOutputTokens += options.maxTokens;
      const stage =
        localAttempt === 1 ? options.stage : `${options.stage}.retry_${localAttempt - 1}`;

      try {
        return await callClaude(messages, systemPrompt, {
          ...options,
          stage,
          observer: this.observer,
          maxRetries: 0
        });
      } catch (error) {
        const nextUsedAttempts = this.observer.snapshot().modelCallCount;
        const canRetry =
          error instanceof AppError &&
          error.retryable &&
          nextUsedAttempts < this.options.maxCallAttempts - reserveAttempts &&
          this.requestedOutputTokens + options.maxTokens <=
            this.options.maxRequestedOutputTokens;

        if (!canRetry) throw error;

        this.retryAttempts += 1;
        const delay = Math.min(
          error.retryAfterMs ?? 500 * 2 ** Math.max(0, localAttempt - 1),
          60_000
        );
        await this.sleep(delay);
      }
    }
  }

  hasCapacity(maxTokens: number, reserveAttempts = 0): boolean {
    return (
      this.observer.snapshot().modelCallCount <
        this.options.maxCallAttempts - reserveAttempts &&
      this.requestedOutputTokens + maxTokens <=
        this.options.maxRequestedOutputTokens
    );
  }

  snapshot(): BudgetUsage {
    return {
      maxCallAttempts: this.options.maxCallAttempts,
      usedCallAttempts: this.observer.snapshot().modelCallCount,
      retryAttempts: this.retryAttempts,
      maxRequestedOutputTokens: this.options.maxRequestedOutputTokens,
      requestedOutputTokens: this.requestedOutputTokens
    };
  }
}
