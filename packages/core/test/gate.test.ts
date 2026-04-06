import { describe, expect, test } from "bun:test";
import { evaluateGates, allGatesPassed } from "../src/eval/gate";
import type { EvalSummary } from "../src/eval/types";
import type { QualityGate } from "../src/eval/gate";

const summary: EvalSummary = {
  configName: "test",
  avgPrecisionAtK: 0.8,
  avgHitRateAtK: 0.7,
  avgRecall: 0.6,
  avgMrr: 0.9,
  avgNdcg: 0.75,
  results: [],
  timestamp: "2026-01-01T00:00:00Z",
};

describe("evaluateGates", () => {
  test("gate passes when actual >= threshold", () => {
    const gates: QualityGate[] = [{ metric: "mrr", threshold: 0.8 }];
    const results = evaluateGates(summary, gates);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].actual).toBe(0.9);
  });

  test("gate fails when actual < threshold", () => {
    const gates: QualityGate[] = [{ metric: "recall", threshold: 0.7 }];
    const results = evaluateGates(summary, gates);
    expect(results[0].passed).toBe(false);
    expect(results[0].actual).toBe(0.6);
  });

  test("gate passes at exact threshold", () => {
    const gates: QualityGate[] = [{ metric: "hitRateAtK", threshold: 0.7 }];
    const results = evaluateGates(summary, gates);
    expect(results[0].passed).toBe(true);
  });

  test("multiple gates mixed results", () => {
    const gates: QualityGate[] = [
      { metric: "mrr", threshold: 0.8 },
      { metric: "recall", threshold: 0.9 },
    ];
    const results = evaluateGates(summary, gates);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });
});

describe("allGatesPassed", () => {
  test("true when all pass", () => {
    const gates: QualityGate[] = [
      { metric: "mrr", threshold: 0.5 },
      { metric: "precisionAtK", threshold: 0.7 },
    ];
    expect(allGatesPassed(evaluateGates(summary, gates))).toBe(true);
  });

  test("false when any fail", () => {
    const gates: QualityGate[] = [
      { metric: "mrr", threshold: 0.5 },
      { metric: "recall", threshold: 0.9 },
    ];
    expect(allGatesPassed(evaluateGates(summary, gates))).toBe(false);
  });

  test("true for empty gates", () => {
    expect(allGatesPassed([])).toBe(true);
  });
});
