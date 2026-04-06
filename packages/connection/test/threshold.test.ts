import { describe, test, expect } from "bun:test";
import { findThreshold, getPairsAboveThreshold } from "../src/threshold";

const matrix = [
  [{ similarity: 0.9 }, { similarity: 0.3 }, { similarity: 0.7 }],
  [{ similarity: 0.1 }, { similarity: 0.8 }, { similarity: 0.5 }],
];
// All sims sorted desc: 0.9, 0.8, 0.7, 0.5, 0.3, 0.1

describe("findThreshold", () => {
  test("returns Kth largest similarity", () => {
    expect(findThreshold(matrix, 1)).toBe(0.9);
    expect(findThreshold(matrix, 2)).toBe(0.8);
    expect(findThreshold(matrix, 3)).toBe(0.7);
    expect(findThreshold(matrix, 4)).toBe(0.5);
  });

  test("returns 0 when targetPairs >= total pairs", () => {
    expect(findThreshold(matrix, 6)).toBe(0);
    expect(findThreshold(matrix, 100)).toBe(0);
  });

  test("returns Infinity when targetPairs <= 0", () => {
    expect(findThreshold(matrix, 0)).toBe(Infinity);
  });

  test("handles empty matrix", () => {
    expect(findThreshold([], 5)).toBe(0);
  });
});

describe("getPairsAboveThreshold", () => {
  test("filters pairs at or above threshold", () => {
    const result = getPairsAboveThreshold(matrix, 0.7);
    expect(result.size).toBe(2);
    expect(result.get(0)!.length).toBe(2); // 0.9 and 0.7
    expect(result.get(1)!.length).toBe(1); // 0.8
  });

  test("omits rows with no qualifying pairs", () => {
    const result = getPairsAboveThreshold(matrix, 0.85);
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
    expect(result.has(1)).toBe(false);
  });

  test("returns empty map when threshold is too high", () => {
    const result = getPairsAboveThreshold(matrix, 1.0);
    expect(result.size).toBe(0);
  });

  test("returns all pairs when threshold is 0", () => {
    const result = getPairsAboveThreshold(matrix, 0);
    expect(result.get(0)!.length).toBe(3);
    expect(result.get(1)!.length).toBe(3);
  });
});
