import { describe, expect, test } from "bun:test";
import {
  classify,
  voteAll,
  voteSubset,
  voteDeepest,
  voteMostSpecific,
} from "../src/classify";
import type { ClusterDef, LabeledItem } from "../src/types";

// ── Test data ───────────────────────────────────────────────────────────

// Two clusters along orthogonal axes in 4D
const CENTROIDS: ClusterDef[] = [
  { id: "alpha", centroid: [1, 0, 0, 0], threshold: 0.5 },
  { id: "beta", centroid: [0, 1, 0, 0], threshold: 0.5 },
  { id: "gamma", centroid: [0, 0, 1, 0], threshold: 0.5 },
];

// Labeled items clearly belonging to each cluster
const LABELED: LabeledItem[] = [
  // Alpha cluster
  { id: "a1", embedding: [0.95, 0.05, 0, 0], clusterIds: ["alpha"] },
  { id: "a2", embedding: [0.9, 0.1, 0, 0], clusterIds: ["alpha"] },
  { id: "a3", embedding: [0.85, 0.15, 0, 0], clusterIds: ["alpha"] },
  { id: "a4", embedding: [0.92, 0.08, 0, 0], clusterIds: ["alpha"] },
  { id: "a5", embedding: [0.88, 0.12, 0, 0], clusterIds: ["alpha"] },
  // Beta cluster
  { id: "b1", embedding: [0.05, 0.95, 0, 0], clusterIds: ["beta"] },
  { id: "b2", embedding: [0.1, 0.9, 0, 0], clusterIds: ["beta"] },
  { id: "b3", embedding: [0.15, 0.85, 0, 0], clusterIds: ["beta"] },
  { id: "b4", embedding: [0.08, 0.92, 0, 0], clusterIds: ["beta"] },
  { id: "b5", embedding: [0.12, 0.88, 0, 0], clusterIds: ["beta"] },
  // Gamma cluster
  { id: "g1", embedding: [0, 0.05, 0.95, 0], clusterIds: ["gamma"] },
  { id: "g2", embedding: [0, 0.1, 0.9, 0], clusterIds: ["gamma"] },
  { id: "g3", embedding: [0, 0.15, 0.85, 0], clusterIds: ["gamma"] },
  { id: "g4", embedding: [0, 0.08, 0.92, 0], clusterIds: ["gamma"] },
  { id: "g5", embedding: [0, 0.12, 0.88, 0], clusterIds: ["gamma"] },
];

// ── Tests ───────────────────────────────────────────────────────────────

describe("classify", () => {
  test("assigns candidates near alpha to alpha", () => {
    const candidates = [
      { id: "new1", embedding: [0.93, 0.07, 0, 0] }, // clearly alpha
    ];

    const results = classify(candidates, LABELED, CENTROIDS, { k: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].clusterId).toBe("alpha");
    expect(results[0].accepted).toBe(true);
    expect(results[0].distance).toBeLessThan(0.5);
    expect(results[0].votes).toBeGreaterThan(0);
  });

  test("assigns candidates near beta to beta", () => {
    const candidates = [
      { id: "new2", embedding: [0.07, 0.93, 0, 0] }, // clearly beta
    ];

    const results = classify(candidates, LABELED, CENTROIDS, { k: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].clusterId).toBe("beta");
    expect(results[0].accepted).toBe(true);
  });

  test("rejects candidates beyond threshold", () => {
    const tightCentroids: ClusterDef[] = [
      { id: "alpha", centroid: [1, 0, 0, 0], threshold: 0.01 },
      { id: "beta", centroid: [0, 1, 0, 0], threshold: 0.01 },
    ];

    // This is close to alpha but not within 0.01 cosine distance
    const candidates = [{ id: "far", embedding: [0.8, 0.6, 0, 0] }];

    const results = classify(candidates, LABELED, tightCentroids, { k: 5 });

    expect(results[0].accepted).toBe(false);
    expect(results[0].clusterId).toBe(null);
  });

  test("handles no threshold (accepts all)", () => {
    const noThreshold: ClusterDef[] = [
      { id: "alpha", centroid: [1, 0, 0, 0] }, // no threshold
      { id: "beta", centroid: [0, 1, 0, 0] },
    ];

    const candidates = [{ id: "far", embedding: [0.5, 0.5, 0.5, 0.5] }];

    const results = classify(candidates, LABELED, noThreshold, { k: 5 });
    expect(results[0].accepted).toBe(true);
  });

  test("classifies multiple candidates", () => {
    const candidates = [
      { id: "new-a", embedding: [0.95, 0.05, 0, 0] },
      { id: "new-b", embedding: [0.05, 0.95, 0, 0] },
      { id: "new-g", embedding: [0, 0.05, 0.95, 0] },
    ];

    const results = classify(candidates, LABELED, CENTROIDS, { k: 5 });

    expect(results).toHaveLength(3);
    expect(results[0].clusterId).toBe("alpha");
    expect(results[1].clusterId).toBe("beta");
    expect(results[2].clusterId).toBe("gamma");
  });

  test("returns empty for empty candidates", () => {
    const results = classify([], LABELED, CENTROIDS);
    expect(results).toHaveLength(0);
  });

  test("rejects all when no labeled data", () => {
    const candidates = [{ id: "x", embedding: [1, 0, 0, 0] }];
    const results = classify(candidates, [], CENTROIDS);
    expect(results).toHaveLength(1);
    expect(results[0].accepted).toBe(false);
    expect(results[0].clusterId).toBe(null);
  });
});

describe("voteAll", () => {
  test("returns all cluster IDs", () => {
    const strategy = voteAll();
    expect(strategy.getVotes(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("returns empty for empty input", () => {
    const strategy = voteAll();
    expect(strategy.getVotes([])).toEqual([]);
  });
});

describe("voteSubset", () => {
  test("filters to valid IDs only", () => {
    const valid = new Set(["alpha", "gamma"]);
    const strategy = voteSubset(valid);
    expect(strategy.getVotes(["alpha", "beta", "gamma"])).toEqual([
      "alpha",
      "gamma",
    ]);
  });

  test("returns empty when no overlap", () => {
    const valid = new Set(["x", "y"]);
    const strategy = voteSubset(valid);
    expect(strategy.getVotes(["alpha", "beta"])).toEqual([]);
  });

  test("filters classification to subset", () => {
    // Items that belong to multiple clusters
    const multiLabeled: LabeledItem[] = LABELED.map((l) => ({
      ...l,
      clusterIds: [...l.clusterIds, "extra"],
    }));

    const candidates = [{ id: "new", embedding: [0.95, 0.05, 0, 0] }];
    const validIds = new Set(["alpha", "beta", "gamma"]);

    const results = classify(candidates, multiLabeled, CENTROIDS, {
      k: 5,
      strategy: voteSubset(validIds),
    });

    expect(results[0].clusterId).toBe("alpha");
  });
});

describe("voteDeepest", () => {
  test("picks the highest-tier cluster", () => {
    const tiers = new Map([
      ["domain", 0],
      ["field", 1],
      ["subfield", 2],
    ]);
    const strategy = voteDeepest(tiers);
    expect(strategy.getVotes(["domain", "field", "subfield"])).toEqual([
      "subfield",
    ]);
  });

  test("ignores clusters not in tier map", () => {
    const tiers = new Map([["field", 1]]);
    const strategy = voteDeepest(tiers);
    expect(strategy.getVotes(["domain", "field", "unknown"])).toEqual([
      "field",
    ]);
  });

  test("returns empty when no clusters in tier map", () => {
    const tiers = new Map([["field", 1]]);
    const strategy = voteDeepest(tiers);
    expect(strategy.getVotes(["x", "y"])).toEqual([]);
  });
});

describe("voteMostSpecific", () => {
  test("picks the highest-specificity cluster", () => {
    const specificity = new Map([
      ["broad", 1],
      ["medium", 5],
      ["narrow", 10],
    ]);
    const strategy = voteMostSpecific(specificity);
    expect(strategy.getVotes(["broad", "medium", "narrow"])).toEqual([
      "narrow",
    ]);
  });
});
