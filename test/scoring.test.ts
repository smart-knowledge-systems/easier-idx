import { describe, expect, test } from "bun:test";
import { computeHybridScore, buildExplanation } from "../src/search/scoring";

describe("computeHybridScore", () => {
  test("pure semantic (hybridWeight = 0)", () => {
    const score = computeHybridScore(0.8, {
      bm25Raw: 5,
      bm25Max: 10,
      hybridWeight: 0,
    });
    expect(score).toBeCloseTo(0.8);
  });

  test("pure keyword (hybridWeight = 1)", () => {
    const score = computeHybridScore(0.8, {
      bm25Raw: 5,
      bm25Max: 10,
      hybridWeight: 1,
    });
    expect(score).toBeCloseTo(0.5); // 5/10
  });

  test("hybrid blend", () => {
    const score = computeHybridScore(0.8, {
      bm25Raw: 5,
      bm25Max: 10,
      hybridWeight: 0.3,
    });
    // (1-0.3)*0.8 + 0.3*0.5 = 0.56 + 0.15 = 0.71
    expect(score).toBeCloseTo(0.71);
  });

  test("with boosts", () => {
    const score = computeHybridScore(0.8, {
      bm25Raw: 0,
      bm25Max: 0,
      hybridWeight: 0,
      boosts: {
        recency: { weight: 0.1, value: 0.5 },
        citations: { weight: 0.2, value: 0.3 },
      },
    });
    // 0.8 + 0.1*0.5 + 0.2*0.3 = 0.8 + 0.05 + 0.06 = 0.91
    expect(score).toBeCloseTo(0.91);
  });

  test("handles zero bm25Max", () => {
    const score = computeHybridScore(0.8, {
      bm25Raw: 5,
      bm25Max: 0,
      hybridWeight: 0.5,
    });
    // normalizedBM25 = 0, so (1-0.5)*0.8 + 0.5*0 = 0.4
    expect(score).toBeCloseTo(0.4);
  });
});

describe("buildExplanation", () => {
  test("includes all boost terms", () => {
    const input = {
      bm25Raw: 5,
      bm25Max: 10,
      hybridWeight: 0.3,
      boosts: {
        recency: { weight: 0.1, value: 0.5 },
      },
    };
    const explanation = buildExplanation(0.8, input, 0.74);
    expect(explanation.cosineSimilarity).toBe(0.8);
    expect(explanation.normalizedBM25).toBeCloseTo(0.5);
    expect(explanation.boosts.recency).toBeCloseTo(0.05);
    expect(explanation.formula).toContain("0.800");
  });
});
