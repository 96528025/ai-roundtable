import type { ModelCallMetric, RunDiagnostics } from "@/types";

export type WorkflowStatus = "success" | "error";

export type RunObserver = {
  runId: string;
  record: (metric: ModelCallMetric) => void;
  finish: (status: WorkflowStatus) => RunDiagnostics;
  snapshot: () => RunDiagnostics;
};

function tokenTotal(metrics: ModelCallMetric[], key: "inputTokens" | "outputTokens"): number | null {
  const values = metrics
    .map((metric) => metric[key])
    .filter((value): value is number => typeof value === "number");

  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

export function createRunObserver(workflow: string): RunObserver {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const metrics: ModelCallMetric[] = [];

  function snapshot(): RunDiagnostics {
    return {
      runId,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAtMs,
      modelCallCount: metrics.length,
      successfulModelCalls: metrics.filter((metric) => metric.status === "success").length,
      failedModelCalls: metrics.filter((metric) => metric.status === "error").length,
      retryCount: metrics.filter((metric) => metric.attempt > 1).length,
      inputTokens: tokenTotal(metrics, "inputTokens"),
      outputTokens: tokenTotal(metrics, "outputTokens"),
      models: [...new Set(metrics.map((metric) => metric.model).filter(Boolean) as string[])]
    };
  }

  return {
    runId,
    record(metric) {
      metrics.push(metric);
      console.info(
        JSON.stringify({
          event: "model_call",
          workflow,
          runId,
          ...metric
        })
      );
    },
    finish(status) {
      const diagnostics = snapshot();
      console.info(
        JSON.stringify({
          event: "workflow_completed",
          workflow,
          status,
          ...diagnostics
        })
      );
      return diagnostics;
    },
    snapshot
  };
}
