import { AppError, invalidRequest } from "@/lib/errors";
import { validateIdea } from "@/lib/debate";
import {
  ContractSchemaError,
  parseIdeaBriefValue,
  parseIdeaFrameValue
} from "@/lib/v2/contract-schema";
import type { IdeaBrief, IdeaFrame, IdeaRequest } from "@/lib/v2/types";

const GOAL_MAX_CHARACTERS = 1_000;
const CONSTRAINT_MAX_CHARACTERS = 300;
const MAX_CONSTRAINTS = 5;

function invalidModelResponse(message: string): AppError {
  return new AppError(message, {
    code: "INVALID_MODEL_RESPONSE",
    status: 502
  });
}

/** Run a pure contract parser and surface schema failures as public 502 errors. */
function asModelResponse<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ContractSchemaError) {
      throw invalidModelResponse(error.message);
    }
    throw error;
  }
}

function extractJsonObject(raw: string, label: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw invalidModelResponse(`${label} did not contain a complete JSON object.`);
  }
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch (error) {
    throw new AppError(`${label} returned invalid JSON.`, {
      code: "INVALID_MODEL_RESPONSE",
      status: 502,
      cause: error
    });
  }
}

export function normalizeIdeaRequest(value: unknown): IdeaRequest {
  const body =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const idea = validateIdea(body.idea);
  let goal: string | undefined;
  if (body.goal !== undefined && body.goal !== null && body.goal !== "") {
    if (typeof body.goal !== "string" || body.goal.trim().length > GOAL_MAX_CHARACTERS) {
      throw invalidRequest(
        `Keep the decision goal under ${GOAL_MAX_CHARACTERS.toLocaleString("en-US")} characters.`,
        "INVALID_REQUEST"
      );
    }
    goal = body.goal.trim() || undefined;
  }

  let constraints: string[] = [];
  if (body.constraints !== undefined) {
    if (!Array.isArray(body.constraints) || body.constraints.length > MAX_CONSTRAINTS) {
      throw invalidRequest(
        `Provide no more than ${MAX_CONSTRAINTS} constraints.`,
        "INVALID_REQUEST"
      );
    }
    constraints = body.constraints.map((constraint, index) => {
      if (
        typeof constraint !== "string" ||
        constraint.trim().length === 0 ||
        constraint.trim().length > CONSTRAINT_MAX_CHARACTERS
      ) {
        throw invalidRequest(
          `Constraint ${index + 1} must be non-empty and under ${CONSTRAINT_MAX_CHARACTERS} characters.`,
          "INVALID_REQUEST"
        );
      }
      return constraint.trim();
    });
  }

  return { idea, goal, constraints };
}

export function parseIdeaFrame(raw: string): IdeaFrame {
  const value = extractJsonObject(raw, "The planner");
  return asModelResponse(() => parseIdeaFrameValue(value));
}

export function parseIdeaBrief(raw: string): IdeaBrief {
  const value = extractJsonObject(raw, "The brief writer");
  return asModelResponse(() => parseIdeaBriefValue(value));
}

export function assertLiveExecutionEnabled(): void {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "sample") {
    throw new AppError(
      "Live model execution is disabled in this sample-only deployment.",
      { code: "LIVE_MODE_DISABLED", status: 403 }
    );
  }
}
