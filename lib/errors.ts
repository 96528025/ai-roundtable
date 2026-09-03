export const appErrorCodes = [
  "INVALID_REQUEST",
  "INVALID_IDEA",
  "INVALID_AGENDA",
  "SERVICE_CONFIGURATION",
  "UPSTREAM_AUTHENTICATION",
  "UPSTREAM_RATE_LIMIT",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_OVERLOADED",
  "UPSTREAM_FAILURE",
  "UPSTREAM_NETWORK",
  "INVALID_MODEL_RESPONSE",
  "BUDGET_EXHAUSTED",
  "LIVE_MODE_DISABLED",
  "INTERNAL_ERROR"
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && (appErrorCodes as readonly string[]).includes(value);
}

type AppErrorOptions = {
  code: AppErrorCode;
  status: number;
  retryable?: boolean;
  requestId?: string;
  retryAfterMs?: number;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, options: AppErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function invalidRequest(
  message: string,
  code: "INVALID_REQUEST" | "INVALID_IDEA" | "INVALID_AGENDA" = "INVALID_REQUEST"
): AppError {
  return new AppError(message, { code, status: 400 });
}

export type PublicError = {
  status: number;
  body: {
    error: string;
    code: AppErrorCode;
    retryable: boolean;
    requestId?: string;
  };
  headers?: Record<string, string>;
};

export function toPublicError(error: unknown, fallbackMessage: string): PublicError {
  if (error instanceof AppError) {
    const retryAfterSeconds = error.retryAfterMs
      ? Math.max(1, Math.ceil(error.retryAfterMs / 1_000))
      : undefined;

    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        requestId: error.requestId
      },
      headers: retryAfterSeconds
        ? { "retry-after": String(retryAfterSeconds) }
        : undefined
    };
  }

  return {
    status: 500,
    body: {
      error: fallbackMessage,
      code: "INTERNAL_ERROR",
      retryable: false
    }
  };
}
