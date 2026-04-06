import { describe, test, expect } from "bun:test";
import { computeSimilarityMatrix } from "../src/matrix";

describe("computeSimilarityMatrix", () => {
  test("identical vectors have similarity 1", () => {
    const a = [{ id: "a", embedding: [1, 0, 0] }];
    const b = [{ id: "b", embedding: [1, 0, 0] }];
    const result = computeSimilarityMatrix(a, b);
    expect(result[0][0].similarity).toBeCloseTo(1, 5);
    expect(result[0][0].aId).toBe("a");
    expect(result[0][0].bId).toBe("b");
  });

  test("orthogonal vectors have similarity 0", () => {
    const a = [{ id: "a", embedding: [1, 0, 0] }];
    const b = [{ id: "b", embedding: [0, 1, 0] }];
    const result = computeSimilarityMatrix(a, b);
    expect(result[0][0].similarity).toBeCloseTo(0, 5);
  });

  test("produces correct matrix dimensions", () => {
    const setA = [
      { id: "a1", embedding: [1, 0] },
      { id: "a2", embedding: [0, 1] },
      { id: "a3", embedding: [1, 1] },
    ];
    const setB = [
      { id: "b1", embedding: [1, 0] },
      { id: "b2", embedding: [0, 1] },
    ];
    const result = computeSimilarityMatrix(setA, setB);
    expect(result.length).toBe(3);
    expect(result[0].length).toBe(2);
    expect(result[1].length).toBe(2);
  });

  test("empty sets produce empty matrix", () => {
    const result = computeSimilarityMatrix([], [{ id: "b", embedding: [1] }]);
    expect(result.length).toBe(0);
  });
});
