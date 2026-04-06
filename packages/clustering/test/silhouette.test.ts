import { describe, expect, test } from "bun:test";
import { silhouetteScore } from "../src/silhouette";

describe("silhouetteScore", () => {
  test("returns high score for well-separated clusters", () => {
    const items = [
      // Cluster A — tightly grouped at [1,0,0]
      { embedding: [1, 0.05, 0], clusterId: "a" },
      { embedding: [1, 0.1, 0], clusterId: "a" },
      { embedding: [1, -0.05, 0], clusterId: "a" },
      { embedding: [1, -0.1, 0], clusterId: "a" },
      // Cluster B — tightly grouped at [0,1,0]
      { embedding: [0.05, 1, 0], clusterId: "b" },
      { embedding: [0.1, 1, 0], clusterId: "b" },
      { embedding: [-0.05, 1, 0], clusterId: "b" },
      { embedding: [-0.1, 1, 0], clusterId: "b" },
    ];

    const score = silhouetteScore(items);
    expect(score).toBeGreaterThan(0.7);
  });

  test("returns low/negative score for overlapping clusters", () => {
    const items = [
      // Both clusters occupy the same region
      { embedding: [1, 1, 0], clusterId: "a" },
      { embedding: [1.1, 1, 0], clusterId: "b" },
      { embedding: [1, 1.1, 0], clusterId: "a" },
      { embedding: [1.05, 1.05, 0], clusterId: "b" },
    ];

    const score = silhouetteScore(items);
    expect(score).toBeLessThan(0.3);
  });

  test("returns 0 for single item", () => {
    expect(silhouetteScore([{ embedding: [1, 0, 0], clusterId: "a" }])).toBe(0);
  });

  test("returns 0 for single cluster", () => {
    const items = [
      { embedding: [1, 0, 0], clusterId: "a" },
      { embedding: [0.9, 0.1, 0], clusterId: "a" },
      { embedding: [0.8, 0.2, 0], clusterId: "a" },
    ];
    expect(silhouetteScore(items)).toBe(0);
  });

  test("respects sampleSize option", () => {
    // With sampling, score should still be reasonable
    const items = Array.from({ length: 100 }, (_, i) => ({
      embedding: i < 50 ? [1, 0, 0] : [0, 1, 0],
      clusterId: i < 50 ? "a" : "b",
    }));

    const full = silhouetteScore(items, { sampleSize: 100 });
    const sampled = silhouetteScore(items, { sampleSize: 20 });

    // Both should be positive for well-separated data
    expect(full).toBeGreaterThan(0.5);
    expect(sampled).toBeGreaterThan(0.3);
  });

  test("handles string cluster IDs", () => {
    const items = [
      { embedding: [1, 0], clusterId: "topic-science" },
      { embedding: [0.9, 0.1], clusterId: "topic-science" },
      { embedding: [0, 1], clusterId: "topic-art" },
      { embedding: [0.1, 0.9], clusterId: "topic-art" },
    ];

    const score = silhouetteScore(items);
    expect(score).toBeGreaterThan(0.5);
  });
});
