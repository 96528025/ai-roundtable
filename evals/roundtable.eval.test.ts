import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { processEnv } from "@next/env";
import { afterAll, describe, expect, it } from "vitest";
import { runSinglePass } from "@/lib/control";
import { runRoundtable } from "@/lib/debate";
import {
  evaluateDecisionBrief,
  evaluateRoundtable,
  type EvaluationReport
} from "@/lib/evaluation";
import type { RunDiagnostics } from "@/types";
import { evaluationCases } from "./cases";

const runLiveEvaluations = process.env.RUN_LIVE_EVALS === "true";

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

type BaselineOutcome = {
  caseName: string;
  panelMode: string;
  multiAgent: {
    workflowReport: EvaluationReport;
    briefReport: EvaluationReport;
    diagnostics?: RunDiagnostics;
  };
  singlePass: {
    briefReport: EvaluationReport;
    diagnostics: RunDiagnostics;
  };
  comparison: {
    briefScoreDelta: number;
    modelCallAttemptRatio: number | null;
    totalTokenRatio: number | null;
    durationRatio: number | null;
  };
};

const outcomes: BaselineOutcome[] = [];

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

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(2)) : null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number(
    (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)
  );
}

describe.skipIf(!runLiveEvaluations)("paired roundtable quality evaluation", () => {
  afterAll(async () => {
    if (outcomes.length === 0) return;

    const allDiagnostics = outcomes.flatMap((outcome) => [
      outcome.multiAgent.diagnostics,
      outcome.singlePass.diagnostics
    ]);
    const models = [
      ...new Set(allDiagnostics.flatMap((diagnostics) => diagnostics?.models ?? []))
    ];
    const baseline = {
      generatedAt: new Date().toISOString(),
      evaluatorVersion: 2,
      experiment: "multi-agent roundtable vs single-pass control",
      git: gitMetadata(),
      models,
      caseCount: outcomes.length,
      multiAgent: {
        passedWorkflowCases: outcomes.filter(
          (outcome) => outcome.multiAgent.workflowReport.passed
        ).length,
        averageWorkflowScore: average(
          outcomes.map((outcome) => outcome.multiAgent.workflowReport.score)
        ),
        averageBriefScore: average(
          outcomes.map((outcome) => outcome.multiAgent.briefReport.score)
        ),
        totalDurationMs: outcomes.reduce(
          (total, outcome) => total + (outcome.multiAgent.diagnostics?.durationMs ?? 0),
          0
        ),
        totalTokens: outcomes.reduce(
          (total, outcome) => total + totalTokens(outcome.multiAgent.diagnostics),
          0
        )
      },
      singlePass: {
        passedBriefCases: outcomes.filter(
          (outcome) => outcome.singlePass.briefReport.passed
        ).length,
        averageBriefScore: average(
          outcomes.map((outcome) => outcome.singlePass.briefReport.score)
        ),
        totalDurationMs: outcomes.reduce(
          (total, outcome) => total + outcome.singlePass.diagnostics.durationMs,
          0
        ),
        totalTokens: outcomes.reduce(
          (total, outcome) => total + totalTokens(outcome.singlePass.diagnostics),
          0
        )
      },
      comparison: {
        averageBriefScoreDelta: average(
          outcomes.map((outcome) => outcome.comparison.briefScoreDelta)
        ),
        averageModelCallAttemptRatio: average(
          outcomes
            .map((outcome) => outcome.comparison.modelCallAttemptRatio)
            .filter((value): value is number => value !== null)
        ),
        averageTotalTokenRatio: average(
          outcomes
            .map((outcome) => outcome.comparison.totalTokenRatio)
            .filter((value): value is number => value !== null)
        ),
        averageDurationRatio: average(
          outcomes
            .map((outcome) => outcome.comparison.durationRatio)
            .filter((value): value is number => value !== null)
        )
      },
      outcomes
    };
    const outputPath = path.resolve(
      process.env.EVAL_RESULTS_PATH || "evals/results/latest.json"
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.info(`Paired evaluation baseline written to ${outputPath}`);
  });

  it.each(evaluationCases.slice(0, caseLimit))(
    "$name compares multi-agent and single-pass output",
    async ({ name, idea, panelMode, topics }) => {
      // Run the one-call control first so configuration failures do not waste a 16-call workflow.
      const singlePassResult = await runSinglePass(idea, topics, panelMode);
      const singlePassBriefReport = evaluateDecisionBrief(singlePassResult.summary);
      const multiAgentResult = await runRoundtable(idea, topics, panelMode);
      const multiAgentWorkflowReport = evaluateRoundtable(multiAgentResult);
      const multiAgentBriefReport = evaluateDecisionBrief(multiAgentResult.summary);
      const multiAgentDiagnostics = multiAgentResult.diagnostics;
      const models = new Set([
        ...singlePassResult.diagnostics.models,
        ...(multiAgentDiagnostics?.models ?? [])
      ]);

      outcomes.push({
        caseName: name,
        panelMode,
        multiAgent: {
          workflowReport: multiAgentWorkflowReport,
          briefReport: multiAgentBriefReport,
          diagnostics: multiAgentDiagnostics
        },
        singlePass: {
          briefReport: singlePassBriefReport,
          diagnostics: singlePassResult.diagnostics
        },
        comparison: {
          briefScoreDelta: multiAgentBriefReport.score - singlePassBriefReport.score,
          modelCallAttemptRatio: ratio(
            multiAgentDiagnostics?.modelCallCount ?? 0,
            singlePassResult.diagnostics.modelCallCount
          ),
          totalTokenRatio: ratio(
            totalTokens(multiAgentDiagnostics),
            totalTokens(singlePassResult.diagnostics)
          ),
          durationRatio: ratio(
            multiAgentDiagnostics?.durationMs ?? 0,
            singlePassResult.diagnostics.durationMs
          )
        }
      });

      expect(models.size, "Both systems must use the same model.").toBe(1);
      expect(
        multiAgentWorkflowReport,
        JSON.stringify(multiAgentWorkflowReport, null, 2)
      ).toMatchObject({ passed: true });
    },
    20 * 60 * 1_000
  );
});
