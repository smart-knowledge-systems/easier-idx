import { describe, expect, test } from "bun:test";
import { kmeansPacked } from "../src/kmeans-packed";

// ── Helpers ─────────────────────────────────────────────────────────────

/** L2-normalize a vector in place. */
function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Pack `count` rows of `dim` columns into a row-major Float32 buffer.
 * Each row is `centroid + noise`, then L2-normalized in place. */
function packCluster(
  buf: Float32Array,
  rowOffset: number,
  centroid: number[],
  count: number,
  noise: number,
  seed: number,
): void {
  let s = seed;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1;
  };
  const dim = centroid.length;
  for (let i = 0; i < count; i++) {
    const off = (rowOffset + i) * dim;
    for (let d = 0; d < dim; d++) buf[off + d] = centroid[d] + rng() * noise;
    normalize(buf.subarray(off, off + dim));
  }
}

const DIM = 4;
const N = 90;
const BUF = new Float32Array(N * DIM);
packCluster(BUF, 0, [1, 0, 0, 0], 30, 0.1, 42);
packCluster(BUF, 30, [0, 1, 0, 0], 30, 0.1, 99);
packCluster(BUF, 60, [0, 0, 1, 0], 30, 0.1, 7);

// Index ranges of the source clusters, for grouping checks.
const RANGE_A: [number, number] = [0, 30];
const RANGE_B: [number, number] = [30, 60];
const RANGE_C: [number, number] = [60, 90];

function clusterIdsInRange(
  assignments: Int32Array,
  [start, end]: [number, number],
): Set<number> {
  const set = new Set<number>();
  for (let i = start; i < end; i++) set.add(assignments[i]);
  return set;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("kmeansPacked", () => {
  test("clusters well-separated data correctly (k=3)", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });

    expect(r.k).toBe(3);
    expect(r.assignments).toHaveLength(N);
    expect(r.centroids).toHaveLength(3 * DIM);
    expect(r.counts).toHaveLength(3);
    expect(r.converged).toBe(true);

    // Each cluster ~30 members.
    for (let c = 0; c < 3; c++) {
      expect(r.counts[c]).toBeGreaterThan(20);
      expect(r.counts[c]).toBeLessThan(40);
    }

    // counts should sum to N.
    let total = 0;
    for (let c = 0; c < 3; c++) total += r.counts[c];
    expect(total).toBe(N);
  });

  test("items from the same source cluster end up together", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    expect(clusterIdsInRange(r.assignments, RANGE_A).size).toBe(1);
    expect(clusterIdsInRange(r.assignments, RANGE_B).size).toBe(1);
    expect(clusterIdsInRange(r.assignments, RANGE_C).size).toBe(1);
  });

  test("every row gets a valid assignment", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    for (let i = 0; i < N; i++) {
      expect(r.assignments[i]).toBeGreaterThanOrEqual(0);
      expect(r.assignments[i]).toBeLessThan(3);
    }
  });

  test("centroids are L2-normalized", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    for (let c = 0; c < 3; c++) {
      let n = 0;
      for (let d = 0; d < DIM; d++) {
        const v = r.centroids[c * DIM + d];
        n += v * v;
      }
      expect(Math.sqrt(n)).toBeCloseTo(1, 5);
    }
  });

  test("deterministic with same seed", () => {
    const a = kmeansPacked(BUF, N, DIM, 3, { seed: 42 });
    const b = kmeansPacked(BUF, N, DIM, 3, { seed: 42 });
    expect(a.inertia).toBe(b.inertia);
    expect(a.iterations).toBe(b.iterations);
    expect(Array.from(a.assignments)).toEqual(Array.from(b.assignments));
  });

  test("multi-run dominates single-run inertia (best-of-N contract)", () => {
    // Under the (seed, k, run) → mixSeed schedule, single-run callers
    // can no longer fan out by passing `seed + r`. Instead the contract
    // we expose is: multi-run inertia is never worse than any single run
    // started from the same base seed.
    const baseSeed = 13;
    const RUNS = 4;
    const multi = kmeansPacked(BUF, N, DIM, 3, {
      seed: baseSeed,
      runs: RUNS,
    });
    const single = kmeansPacked(BUF, N, DIM, 3, {
      seed: baseSeed,
      runs: 1,
    });
    expect(multi.inertia).toBeLessThanOrEqual(single.inertia + 1e-9);
  });

  // Regression guard: pinned partition at seed=42, k=2 on the 90-point
  // synthetic corpus. Same baseline as `kmeans.test.ts`.
  test("snapshot: seed=42 k=2 partition is stable", () => {
    const r = kmeansPacked(BUF, N, DIM, 2, { seed: 42, runs: 5 });
    const sizes = Array.from(r.counts).sort((a, b) => a - b);
    expect(sizes).toEqual([30, 60]);
    expect(r.converged).toBe(true);
  });

  test("multiple runs picks best inertia (>= single-run quality)", () => {
    const single = kmeansPacked(BUF, N, DIM, 3, { seed: 1, runs: 1 });
    const multi = kmeansPacked(BUF, N, DIM, 3, { seed: 1, runs: 5 });
    expect(multi.inertia).toBeLessThanOrEqual(single.inertia + 1e-9);
  });

  test("calls onProgress", () => {
    const calls: { iter: number; inertia: number }[] = [];
    kmeansPacked(BUF, N, DIM, 3, {
      seed: 1,
      onProgress: (iter, inertia) => calls.push({ iter, inertia }),
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].iter).toBe(0);
    expect(calls[0].inertia).toBeGreaterThan(0);
  });

  test("throws for k <= 0", () => {
    expect(() => kmeansPacked(BUF, N, DIM, 0)).toThrow();
  });

  test("throws for k > n", () => {
    expect(() => kmeansPacked(BUF, N, DIM, N + 1)).toThrow();
  });

  test("throws when buf length doesn't match n*dim", () => {
    const wrong = new Float32Array(N * DIM - 1);
    expect(() => kmeansPacked(wrong, N, DIM, 3)).toThrow();
  });

  test("handles empty input", () => {
    const empty = new Float32Array(0);
    const r = kmeansPacked(empty, 0, DIM, 1);
    expect(r.assignments).toHaveLength(0);
    expect(r.centroids).toHaveLength(0);
    expect(r.converged).toBe(true);
  });

  test("k=1 puts everything in one cluster", () => {
    const r = kmeansPacked(BUF, N, DIM, 1, { seed: 1 });
    expect(r.counts[0]).toBe(N);
    for (let i = 0; i < N; i++) expect(r.assignments[i]).toBe(0);
  });

  test("works with SharedArrayBuffer-backed input", () => {
    const sab = new SharedArrayBuffer(N * DIM * 4);
    const view = new Float32Array(sab);
    view.set(BUF);
    const r = kmeansPacked(view, N, DIM, 3, { seed: 1 });
    expect(r.converged).toBe(true);
    expect(clusterIdsInRange(r.assignments, RANGE_A).size).toBe(1);
  });
});
