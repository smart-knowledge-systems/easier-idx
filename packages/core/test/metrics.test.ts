import { describe, expect, test } from "bun:test";
import {
  precisionAtK,
  hitRateAtK,
  recall,
  mrr,
  ndcg,
} from "../src/eval/metrics";

describe("precisionAtK", () => {
  test("perfect precision", () => {
    expect(precisionAtK(["a", "b", "c"], ["a", "b", "c"], 3)).toBe(1);
  });

  test("partial precision", () => {
    expect(precisionAtK(["a", "b", "c", "d", "e"], ["a", "c"], 5)).toBe(2 / 5);
  });

  test("no hits", () => {
    expect(precisionAtK(["x", "y", "z"], ["a", "b"], 3)).toBe(0);
  });

  test("empty expected with empty returned", () => {
    expect(precisionAtK([], [], 5)).toBe(1);
  });

  test("empty expected with results", () => {
    expect(precisionAtK(["a"], [], 5)).toBe(0);
  });

  test("k larger than results", () => {
    expect(precisionAtK(["a"], ["a"], 5)).toBe(1 / 5);
  });
});

describe("hitRateAtK", () => {
  test("all expected found", () => {
    expect(hitRateAtK(["a", "b", "c"], ["a", "b"], 3)).toBe(1);
  });

  test("partial hit rate", () => {
    expect(
      hitRateAtK(["a", "x", "y", "z", "w"], ["a", "b", "c"], 5),
    ).toBeCloseTo(1 / 3);
  });

  test("no hits", () => {
    expect(hitRateAtK(["x", "y"], ["a", "b"], 5)).toBe(0);
  });
});

describe("recall", () => {
  test("perfect recall", () => {
    expect(recall(["a", "b", "c", "d"], ["a", "b"])).toBe(1);
  });

  test("partial recall", () => {
    expect(recall(["a", "x"], ["a", "b"])).toBe(0.5);
  });

  test("no recall", () => {
    expect(recall(["x", "y"], ["a", "b"])).toBe(0);
  });
});

describe("mrr", () => {
  test("first result is relevant", () => {
    expect(mrr(["a", "b", "c"], ["a"])).toBe(1);
  });

  test("second result is relevant", () => {
    expect(mrr(["x", "a", "c"], ["a"])).toBe(0.5);
  });

  test("no relevant result", () => {
    expect(mrr(["x", "y", "z"], ["a"])).toBe(0);
  });

  test("third result is first relevant", () => {
    expect(mrr(["x", "y", "a"], ["a", "b"])).toBeCloseTo(1 / 3);
  });
});

describe("ndcg", () => {
  test("perfect ranking", () => {
    expect(ndcg(["a", "b"], ["a", "b"], 5)).toBeCloseTo(1);
  });

  test("reversed ranking still sums correctly", () => {
    const result = ndcg(["b", "a"], ["a", "b"], 5);
    expect(result).toBeCloseTo(1); // both relevant, order doesn't matter for binary relevance
  });

  test("no relevant results", () => {
    expect(ndcg(["x", "y", "z"], ["a", "b"], 5)).toBe(0);
  });

  test("relevant result at position 2", () => {
    // DCG = 0/log2(2) + 1/log2(3) = 0.6309
    // IDCG = 1/log2(2) = 1
    const result = ndcg(["x", "a"], ["a"], 5);
    expect(result).toBeCloseTo(1 / Math.log2(3));
  });

  test("empty expected with empty returned", () => {
    expect(ndcg([], [], 5)).toBe(1);
  });
});
