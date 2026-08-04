import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { processEnv } from "@next/env";
import { afterAll, describe, expect, it } from "vitest";
import { runRoundtable } from "@/lib/debate";
import { evaluateRoundtable, type EvaluationReport } from "@/lib/evaluation";
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
  report: EvaluationReport;
  diagnostics?: RunDiagnostics;
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

describe.skipIf(!runLiveEvaluations)("live roundtable quality evaluation", () => {
  afterAll(async () => {
    if (outcomes.length === 0) return;

    const scores = outcomes.map((outcome) => outcome.report.score);
    const models = [
      ...new Set(outcomes.flatMap((outcome) => outcome.diagnostics?.models ?? []))
    ];
    const baseline = {
      generatedAt: new Date().toISOString(),
      evaluatorVersion: 1,
      git: gitMetadata(),
      models,
      caseCount: outcomes.length,
      passedCases: outcomes.filter((outcome) => outcome.report.passed).length,
      averageScore: Number(
        (scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(1)
      ),
      totalDurationMs: outcomes.reduce(
        (total, outcome) => total + (outcome.diagnostics?.durationMs ?? 0),
        0
      ),
      totalInputTokens: outcomes.reduce(
        (total, outcome) => total + (outcome.diagnostics?.inputTokens ?? 0),
        0
      ),
      totalOutputTokens: outcomes.reduce(
        (total, outcome) => total + (outcome.diagnostics?.outputTokens ?? 0),
        0
      ),
      outcomes
    };
    const outputPath = path.resolve(
      process.env.EVAL_RESULTS_PATH || "evals/results/latest.json"
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.info(`Evaluation baseline written to ${outputPath}`);
  });

  it.each(evaluationCases.slice(0, caseLimit))(
    "$name meets the quality threshold",
    async ({ name, idea, panelMode, topics }) => {
      const result = await runRoundtable(idea, topics, panelMode);
      const report = evaluateRoundtable(result);

      outcomes.push({
        caseName: name,
        panelMode,
        report,
        diagnostics: result.diagnostics
      });

      expect(report, JSON.stringify(report, null, 2)).toMatchObject({ passed: true });
    },
    20 * 60 * 1_000
  );
});
