import { describe, expect, test } from "bun:test";
import { kmeans, kmeansSearch } from "../src/kmeans";
import { mixSeed, mixSeed64 } from "../src/prng";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Generate a cluster of points around a centroid with small noise. */
function makeCluster(
  centroid: number[],
  n: number,
  noise: number,
  seed: number,
): { id: string; embedding: number[] }[] {
  let s = seed;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1; // [-1, 1]
  };

  return Array.from({ length: n }, (_, i) => ({
    id: `c${seed}-${i}`,
    embedding: centroid.map((v) => v + rng() * noise),
  }));
}

// Three well-separated clusters in 4D
const CLUSTER_A = makeCluster([1, 0, 0, 0], 30, 0.1, 42);
const CLUSTER_B = makeCluster([0, 1, 0, 0], 30, 0.1, 99);
const CLUSTER_C = makeCluster([0, 0, 1, 0], 30, 0.1, 7);
const ALL_ITEMS = [...CLUSTER_A, ...CLUSTER_B, ...CLUSTER_C];

// ── Tests ───────────────────────────────────────────────────────────────

describe("kmeans", () => {
  test("clusters well-separated data correctly (k=3)", () => {
    const result = kmeans(ALL_ITEMS, 3, { seed: 1 });

    expect(result.k).toBe(3);
    expect(result.clusters).toHaveLength(3);
    expect(result.assignments).toHaveLength(90);
    expect(result.converged).toBe(true);
    expect(result.silhouette).toBeGreaterThan(0.5);

    // Each cluster should contain ~30 items
    for (const cluster of result.clusters) {
      expect(cluster.size).toBeGreaterThan(20);
      expect(cluster.size).toBeLessThan(40);
      expect(cluster.memberIds).toHaveLength(cluster.size);
    }
  });

  test("every item gets exactly one assignment", () => {
    const result = kmeans(ALL_ITEMS, 3, { seed: 1 });

    const assignedIds = new Set(result.assignments.map((a) => a.id));
    expect(assignedIds.size).toBe(ALL_ITEMS.length);

    for (const item of ALL_ITEMS) {
      expect(assignedIds.has(item.id)).toBe(true);
    }
  });

  test("items from the same source cluster end up together", () => {
    const result = kmeans(ALL_ITEMS, 3, { seed: 1 });

    // All items from CLUSTER_A should be in the same k-means cluster
    const aIds = new Set(CLUSTER_A.map((x) => x.id));
    const aAssignments = result.assignments.filter((a) => aIds.has(a.id));
    const aClusterIds = new Set(aAssignments.map((a) => a.clusterId));
    expect(aClusterIds.size).toBe(1);

    // Same for CLUSTER_B
    const bIds = new Set(CLUSTER_B.map((x) => x.id));
    const bAssignments = result.assignments.filter((a) => bIds.has(a.id));
    const bClusterIds = new Set(bAssignments.map((a) => a.clusterId));
    expect(bClusterIds.size).toBe(1);
  });

  test("centroids are stored as plain number[]", () => {
    const result = kmeans(ALL_ITEMS, 3, { seed: 1 });
    for (const cluster of result.clusters) {
      expect(Array.isArray(cluster.centroid)).toBe(true);
      expect(cluster.centroid).toHaveLength(4);
      expect(typeof cluster.centroid[0]).toBe("number");
    }
  });

  test("distances are non-negative cosine distances", () => {
    const result = kmeans(ALL_ITEMS, 3, { seed: 1 });
    for (const a of result.assignments) {
      expect(a.distance).toBeGreaterThanOrEqual(0);
      expect(a.distance).toBeLessThan(2); // max cosine distance
    }
  });

  test("deterministic with seed", () => {
    const a = kmeans(ALL_ITEMS, 3, { seed: 42 });
    const b = kmeans(ALL_ITEMS, 3, { seed: 42 });
    expect(a.silhouette).toBe(b.silhouette);
    expect(a.iterations).toBe(b.iterations);
  });

  test("multiple runs picks best inertia", () => {
    const single = kmeans(ALL_ITEMS, 3, { seed: 1, runs: 1 });
    const multi = kmeans(ALL_ITEMS, 3, { seed: 1, runs: 5 });

    // Multi-run should be at least as good
    expect(multi.silhouette).toBeGreaterThanOrEqual(single.silhouette - 0.01);
  });

  test("calls onProgress", () => {
    const progressCalls: { iter: number; inertia: number }[] = [];
    kmeans(ALL_ITEMS, 3, {
      seed: 1,
      onProgress: (iter, inertia) => progressCalls.push({ iter, inertia }),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0].iter).toBe(0);
    expect(progressCalls[0].inertia).toBeGreaterThan(0);
  });

  test("throws for k > n", () => {
    expect(() => kmeans(ALL_ITEMS.slice(0, 2), 5)).toThrow();
  });

  test("throws for k <= 0", () => {
    expect(() => kmeans(ALL_ITEMS, 0)).toThrow();
  });

  test("handles empty input", () => {
    const result = kmeans([], 1);
    expect(result.clusters).toHaveLength(0);
    expect(result.assignments).toHaveLength(0);
    expect(result.converged).toBe(true);
  });

  test("k=1 puts everything in one cluster", () => {
    const result = kmeans(ALL_ITEMS, 1, { seed: 1 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].size).toBe(90);
    expect(result.silhouette).toBe(0);
  });

  // Regression guard: at (seed=42, k=2, runs=5) on the 90-point synthetic
  // corpus, the partition is "cluster A vs (B + C)" because A is more
  // similar to itself than to either of the other clusters. Sizes 30 + 60.
  // Pins the algorithmic-equivalence baseline shared with the Rust backend.
  test("snapshot: seed=42 k=2 partition is stable", () => {
    const r = kmeans(ALL_ITEMS, 2, { seed: 42, runs: 5 });
    const sizes = r.clusters.map((c) => c.size).sort((a, b) => a - b);
    expect(sizes).toEqual([30, 60]);
    expect(r.converged).toBe(true);
    // All 30 CLUSTER_A items co-cluster.
    const aIds = new Set(CLUSTER_A.map((x) => x.id));
    const aClusters = new Set(
      r.assignments.filter((a) => aIds.has(a.id)).map((a) => a.clusterId),
    );
    expect(aClusters.size).toBe(1);
  });
});

describe("mixSeed", () => {
  // Pinned bit-for-bit against the Rust port at
  // metal/paradigmap-projector/src/kmeans.rs::mix_seed. Reference values
  // computed once from the algorithm; if either backend changes, both
  // tests must update together.
  test("matches Rust reference values", () => {
    expect(mixSeed64(42n, 2n, 0n)).toBe(0x761a44e8f7283712n);
    expect(mixSeed64(42n, 2n, 1n)).toBe(0x89d075fba46d6161n);
    expect(mixSeed64(42n, 3n, 0n)).toBe(0x18381731303afc2fn);
    expect(mixSeed64(42n, 4n, 4n)).toBe(0xfdc88ab475753af2n);
  });

  test("public mixSeed folds 64 bits into a 32-bit safe integer", () => {
    const v = mixSeed(42, 2, 0);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
    // (mixSeed64 ^ folded) parity check.
    const mixed = mixSeed64(42n, 2n, 0n);
    const lo = Number(mixed & 0xffffffffn);
    const hi = Number((mixed >> 32n) & 0xffffffffn);
    expect(v).toBe((lo ^ hi) >>> 0);
  });

  test("master=0 across runs produces distinct seeds (avalanche)", () => {
    const seeds = new Set<number>();
    for (let r = 0; r < 8; r++) seeds.add(mixSeed(0, 2, r));
    expect(seeds.size).toBe(8);
  });

  // BigInt(3.14) throws RangeError. Truncating toward zero matches the old
  // `createRng` `>>> 0` coercion and keeps mixSeed safe for float / NaN inputs.
  test("non-integer inputs are truncated, not thrown", () => {
    expect(() => mixSeed(3.14, 2, 0)).not.toThrow();
    expect(mixSeed(3.14, 2, 0)).toBe(mixSeed(3, 2, 0));
    expect(mixSeed(-2.9, 2, 0)).toBe(mixSeed(-2, 2, 0));
    expect(() => mixSeed(Number.NaN, 2, 0)).not.toThrow();
    expect(mixSeed(Number.NaN, 2, 0)).toBe(mixSeed(0, 2, 0));
  });
});

describe("kmeansSearch", () => {
  test("returns results sorted by silhouette (best first)", () => {
    const results = kmeansSearch(ALL_ITEMS, { min: 2, max: 5 }, { seed: 1 });

    expect(results).toHaveLength(4);

    // Verify sorted descending by silhouette
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].silhouette).toBeGreaterThanOrEqual(
        results[i].silhouette,
      );
    }

    // k=3 should be near the top for well-separated 3-cluster data
    const bestK = results[0].k;
    expect(bestK).toBe(3);
  });

  test("stops early if k exceeds item count", () => {
    const small = ALL_ITEMS.slice(0, 5);
    const results = kmeansSearch(small, { min: 2, max: 100 }, { seed: 1 });
    expect(results).toHaveLength(4); // k=2,3,4,5
  });
});
