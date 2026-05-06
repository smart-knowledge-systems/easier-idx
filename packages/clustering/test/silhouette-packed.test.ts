import { describe, expect, test } from "bun:test";
import { kmeansPacked } from "../src/kmeans-packed";
import { silhouettePacked } from "../src/silhouette-packed";

// ── Helpers ─────────────────────────────────────────────────────────────

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

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

// ── Tests ───────────────────────────────────────────────────────────────

describe("silhouettePacked", () => {
  test("scores well-separated clusters above 0.5", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    const s = silhouettePacked(BUF, N, DIM, r.assignments, 3);
    expect(s).toBeGreaterThan(0.5);
  });

  test("k=1 returns 0", () => {
    const assignments = new Int32Array(N); // all zero
    const s = silhouettePacked(BUF, N, DIM, assignments, 1);
    expect(s).toBe(0);
  });

  test("score is in [-1, 1]", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    const s = silhouettePacked(BUF, N, DIM, r.assignments, 3);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
  });

  test("worse k (over-splitting) scores lower than correct k", () => {
    const r3 = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    const r6 = kmeansPacked(BUF, N, DIM, 6, { seed: 1 });
    const s3 = silhouettePacked(BUF, N, DIM, r3.assignments, 3);
    const s6 = silhouettePacked(BUF, N, DIM, r6.assignments, 6);
    expect(s3).toBeGreaterThan(s6);
  });

  test("deterministic — same input produces same score", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    const a = silhouettePacked(BUF, N, DIM, r.assignments, 3);
    const b = silhouettePacked(BUF, N, DIM, r.assignments, 3);
    expect(a).toBe(b);
  });

  test("handles empty clusters in the middle of the index", () => {
    // Manually assign every row to cluster 0 or 2, leaving cluster 1 empty.
    const assignments = new Int32Array(N);
    for (let i = 0; i < 30; i++) assignments[i] = 0;
    for (let i = 30; i < 90; i++) assignments[i] = 2;
    const s = silhouettePacked(BUF, N, DIM, assignments, 3);
    // With one empty cluster and two real ones, score should still be valid.
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
    expect(Number.isFinite(s)).toBe(true);
  });

  test("throws on assignment length mismatch", () => {
    const wrong = new Int32Array(N - 1);
    expect(() => silhouettePacked(BUF, N, DIM, wrong, 3)).toThrow();
  });

  test("throws on buf length mismatch", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    const wrong = new Float32Array(N * DIM - 1);
    expect(() => silhouettePacked(wrong, N, DIM, r.assignments, 3)).toThrow();
  });

  test("returns 0 for n <= 1", () => {
    const tinyBuf = new Float32Array(DIM);
    tinyBuf[0] = 1;
    const tinyAssign = new Int32Array(1);
    expect(silhouettePacked(tinyBuf, 1, DIM, tinyAssign, 1)).toBe(0);
  });

  test("respects sampleSize option", () => {
    const r = kmeansPacked(BUF, N, DIM, 3, { seed: 1 });
    const big = silhouettePacked(BUF, N, DIM, r.assignments, 3, {
      sampleSize: 2000,
    });
    const small = silhouettePacked(BUF, N, DIM, r.assignments, 3, {
      sampleSize: 30,
    });
    // Both should be in valid range; smaller sample is allowed to differ but
    // for this well-separated data they should be within ~0.2 of each other.
    expect(Math.abs(big - small)).toBeLessThan(0.2);
  });
});
