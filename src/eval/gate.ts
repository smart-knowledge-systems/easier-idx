// ---------------------------------------------------------------------------
// Quality gates — pass/fail thresholds on eval metrics
// ---------------------------------------------------------------------------

import type { EvalSummary } from "./types";

/** A quality threshold on a specific metric. */
export interface QualityGate {
  readonly metric: "precisionAtK" | "hitRateAtK" | "recall" | "mrr" | "ndcg";
  readonly threshold: number;
}

/** Result of checking one gate against an eval summary. */
export interface GateResult {
  readonly gate: QualityGate;
  readonly actual: number;
  readonly passed: boolean;
}

const METRIC_TO_FIELD: Record<QualityGate["metric"], keyof EvalSummary> = {
  precisionAtK: "avgPrecisionAtK",
  hitRateAtK: "avgHitRateAtK",
  recall: "avgRecall",
  mrr: "avgMrr",
  ndcg: "avgNdcg",
};

/** Evaluate all gates against an eval summary. */
export function evaluateGates(
  summary: EvalSummary,
  gates: QualityGate[],
): GateResult[] {
  return gates.map((gate) => {
    const actual = summary[METRIC_TO_FIELD[gate.metric]] as number;
    return { gate, actual, passed: actual >= gate.threshold };
  });
}

/** Check whether every gate passed. */
export function allGatesPassed(results: GateResult[]): boolean {
  return results.every((r) => r.passed);
}
