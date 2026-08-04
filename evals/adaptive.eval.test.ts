import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { processEnv } from "@next/env";
import { afterAll, describe, expect, it } from "vitest";
import { runRoundtable } from "@/lib/debate";
import {
  evaluateDecisionBrief,
  evaluateIdeaBrief,
  evaluateRoundtable,
  type EvaluationReport
} from "@/lib/evaluation";
import { runDirectBrief, runQuickBrief } from "@/lib/v2/quick-brief";
import type { BudgetUsage, RouteDecision } from "@/lib/v2/types";
import type { RunDiagnostics } from "@/types";
import { evaluationCases } from "./cases";

const runLiveEvaluations = process.env.RUN_V2_LIVE_EVALS === "true";

if (runLiveEvaluations && !process.env.ANTHROPIC_API_KEY) {
  const localEnvPath = path.resolve(".env.local");
  if (existsSync(localEnvPath)) {
    processEnv(
      [{ path: ".env.local", contents: readFileSync(localEnvPath, "utf8"), env: {} }],
      process.cwd(),
      console,
      true
    );
  }
}

const requestedLimit = Number(process.env.EVAL_CASE_LIMIT || evaluationCases.length);
const caseLimit = Number.isFinite(requestedLimit)
  ? Math.max(1, Math.min(requestedLimit, evaluationCases.length))
  : evaluationCases.length;
const selectedCases = evaluationCases.slice(0, caseLimit);

type AdaptiveOutcome = {
  caseName: string;
  directBrief: {
    report: EvaluationReport;
    diagnostics: RunDiagnostics;
    budget: BudgetUsage;
  };
  plannedQuick: {
    report: EvaluationReport;
    diagnostics: RunDiagnostics;
    budget: BudgetUsage;
    route: RouteDecision;
  };
  fixedRoundtable: {
    briefReport: EvaluationReport;
    workflowReport: EvaluationReport;
    diagnostics?: RunDiagnostics;
  };
};

const outcomes: AdaptiveOutcome[] = [];

function gitMetadata(): { commit: string; dirty: boolean } {
  try {
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      dirty:
        execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
          .length > 0
    };
  } catch {
    return { commit: "unavailable", dirty: true };
  }
}

function totalTokens(diagnostics: RunDiagnostics | undefined): number {
  return (diagnostics?.inputTokens ?? 0) + (diagnostics?.outputTokens ?? 0);
}

function aggregate(
  diagnostics: Array<RunDiagnostics | undefined>
): { attempts: number; durationMs: number; tokens: number } {
  return {
    attempts: diagnostics.reduce((sum, item) => sum + (item?.modelCallCount ?? 0), 0),
    durationMs: diagnostics.reduce((sum, item) => sum + (item?.durationMs ?? 0), 0),
    tokens: diagnostics.reduce((sum, item) => sum + totalTokens(item), 0)
  };
}

describe.skipIf(!runLiveEvaluations)("V2 three-way workflow evaluation", () => {
  afterAll(async () => {
    const completedNames = new Set(outcomes.map((outcome) => outcome.caseName));
    const missingCaseNames = selectedCases
      .map((evaluationCase) => evaluationCase.name)
      .filter((name) => !completedNames.has(name));
    const allDiagnostics = outcomes.flatMap((outcome) => [
      outcome.directBrief.diagnostics,
      outcome.plannedQuick.diagnostics,
      outcome.fixedRoundtable.diagnostics
    ]);
    const result = {
      generatedAt: new Date().toISOString(),
      evaluatorVersion: 3,
      experiment: "direct brief vs planned Quick Brief vs fixed roundtable",
      git: gitMetadata(),
      complete: missingCaseNames.length === 0,
      intendedCaseCount: selectedCases.length,
      completedCaseCount: outcomes.length,
      missingCaseNames,
      models: [
        ...new Set(allDiagnostics.flatMap((diagnostics) => diagnostics?.models ?? []))
      ],
      measurements: {
        directBrief: aggregate(outcomes.map((outcome) => outcome.directBrief.diagnostics)),
        plannedQuick: aggregate(outcomes.map((outcome) => outcome.plannedQuick.diagnostics)),
        fixedRoundtable: aggregate(
          outcomes.map((outcome) => outcome.fixedRoundtable.diagnostics)
        )
      },
      humanRatings: {
        status: "not_collected",
        note: "Do not claim decision-usefulness superiority from structural scores."
      },
      evidenceAccuracy: {
        status: "not_applicable_no_research",
        note: "Milestone 1 prohibits external evidence claims."
      },
      outcomes
    };
    const outputPath = path.resolve(
      process.env.EVAL_RESULTS_PATH || "evals/results/v2-latest.json"
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.info(`V2 evaluation result written to ${outputPath}`);
  });

  it.each(selectedCases)(
    "$name compares all three workflows without claiming score equivalence",
    async ({ name, idea, panelMode, topics }) => {
      const request = { idea, constraints: [] };

      // Fail cheap: one-call direct control, then two-call Quick Brief, then fixed workflow.
      const direct = await runDirectBrief(request);
      const quick = await runQuickBrief(request);
      const fixed = await runRoundtable(idea, topics, panelMode);
      const models = new Set([
        ...direct.diagnostics.models,
        ...quick.diagnostics.models,
        ...(fixed.diagnostics?.models ?? [])
      ]);

      outcomes.push({
        caseName: name,
        directBrief: {
          report: evaluateIdeaBrief(direct.brief),
          diagnostics: direct.diagnostics,
          budget: direct.budget
        },
        plannedQuick: {
          report: evaluateIdeaBrief(quick.brief),
          diagnostics: quick.diagnostics,
          budget: quick.budget,
          route: quick.route
        },
        fixedRoundtable: {
          briefReport: evaluateDecisionBrief(fixed.summary),
          workflowReport: evaluateRoundtable(fixed),
          diagnostics: fixed.diagnostics
        }
      });

      expect(models.size, "All three workflows must use the same model.").toBe(1);
      expect(evaluateIdeaBrief(direct.brief).passed).toBe(true);
      expect(evaluateIdeaBrief(quick.brief).passed).toBe(true);
      expect(evaluateRoundtable(fixed).passed).toBe(true);
    },
    25 * 60 * 1_000
  );
});
