// ---------------------------------------------------------------------------
// K-means clustering — packed Float32 buffer entry point
//
// Operates on a row-major Float32Array (n × dim) of pre-normalized vectors.
// Designed for worker fan-out (SharedArrayBuffer-friendly) and lower memory
// pressure than the boxed `Float64Array[]` path in `./kmeans.ts`.
// ---------------------------------------------------------------------------

import { createRng, mixSeed } from "./prng";
import { dotPacked } from "./vecmath";
import type { KMeansOptions, PackedClusterResult } from "./types";

// ── Vector math on the packed buffer ────────────────────────────────────

function normalizePacked(buf: Float32Array, off: number, dim: number): void {
  let n = 0;
  for (let d = 0; d < dim; d++) n += buf[off + d] * buf[off + d];
  n = Math.sqrt(n);
  if (n > 0) for (let d = 0; d < dim; d++) buf[off + d] /= n;
}

// ── K-means++ initialization ────────────────────────────────────────────

function kmeansppInitPacked(
  buf: Float32Array,
  n: number,
  dim: number,
  k: number,
  rng: () => number,
): Float32Array {
  const centroids = new Float32Array(k * dim);
  const minDist = new Float64Array(n).fill(Infinity);

  // First centroid: random row.
  let firstIdx = Math.floor(rng() * n);
  if (firstIdx >= n) firstIdx = n - 1;
  centroids.set(buf.subarray(firstIdx * dim, firstIdx * dim + dim), 0);

  for (let c = 1; c < k; c++) {
    const prevOff = (c - 1) * dim;

    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const d = 1 - dotPacked(buf, i * dim, centroids, prevOff, dim);
      if (d < minDist[i]) minDist[i] = d;
      totalWeight += minDist[i] * minDist[i];
    }

    let target = rng() * totalWeight;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      target -= minDist[i] * minDist[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.set(buf.subarray(chosen * dim, chosen * dim + dim), c * dim);
  }

  return centroids;
}

// ── Lloyd's algorithm (packed) ──────────────────────────────────────────

interface LloydsPackedResult {
  centroids: Float32Array;
  assignments: Int32Array;
  counts: Int32Array;
  inertia: number;
  iterations: number;
  converged: boolean;
}

function lloydsPacked(
  buf: Float32Array,
  n: number,
  dim: number,
  initialCentroids: Float32Array,
  maxIterations: number,
  onProgress?: (iteration: number, inertia: number) => void,
): LloydsPackedResult {
  const k = initialCentroids.length / dim;
  const centroids = new Float32Array(initialCentroids);
  const assignments = new Int32Array(n);
  const counts = new Int32Array(k);
  // Float64 accumulators — Float32 would shed precision summing thousands
  // of vectors per cluster at high dim.
  const sums = new Float64Array(k * dim);
  let converged = false;
  let inertia = 0;
  let iter = 0;

  for (; iter < maxIterations; iter++) {
    // ── Assignment step (also tallies counts so they're populated even
    // when we converge on iter 0 and skip the update step). ──
    let changed = 0;
    inertia = 0;
    counts.fill(0);

    for (let i = 0; i < n; i++) {
      const rowOff = i * dim;
      let bestDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = 1 - dotPacked(buf, rowOff, centroids, c * dim, dim);
        if (d < bestDist) {
          bestDist = d;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed++;
      }
      counts[bestCluster]++;
      inertia += bestDist;
    }

    onProgress?.(iter, inertia);

    if (changed === 0) {
      converged = true;
      break;
    }

    // ── Update step ──
    sums.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      const sumOff = c * dim;
      const rowOff = i * dim;
      for (let d = 0; d < dim; d++) sums[sumOff + d] += buf[rowOff + d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      const cOff = c * dim;
      const inv = 1 / counts[c];
      for (let d = 0; d < dim; d++) centroids[cOff + d] = sums[cOff + d] * inv;
      normalizePacked(centroids, cOff, dim);
    }
  }

  return {
    centroids,
    assignments,
    counts,
    inertia,
    iterations: iter + (converged ? 1 : 0),
    converged,
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * K-means clustering on a packed Float32 buffer.
 *
 * The buffer is row-major `n × dim`, each row L2-normalized. (Normalization
 * is the caller's responsibility — typically done at write-time when packing
 * embeddings from the database.) Cosine distance reduces to `1 - dot`.
 * Centroids are stored packed and renormalized after each update step.
 *
 * Use this entry point when you have (or can build) a packed buffer and want
 * to avoid the per-row allocation and Float32→Float64 conversion of the
 * boxed `kmeans()` path. SharedArrayBuffer-backed inputs work transparently
 * and let multiple workers read the same data without copies.
 *
 * Determinism: identical inputs and `seed` produce identical outputs. The
 * per-run seed schedule is `mixSeed(seed, k, runIndex)` (SplitMix64 over the
 * (seed, k, run) tuple), so adjacent runs are statistically independent and
 * agreement with the Rust `paradigmap-projector` backend is preserved.
 * Bit-exactness vs. the boxed `kmeans()` is NOT promised — Float32 rounding
 * diverges from Float64.
 *
 * Silhouette is omitted by design; pair with `silhouettePacked` on the runs
 * worth scoring (e.g. only the winner of a sweep).
 */
export function kmeansPacked(
  buf: Float32Array,
  n: number,
  dim: number,
  k: number,
  options?: KMeansOptions,
): PackedClusterResult {
  const { maxIterations = 100, runs = 1, seed, onProgress } = options ?? {};

  if (n === 0) {
    return {
      k,
      assignments: new Int32Array(0),
      centroids: new Float32Array(0),
      counts: new Int32Array(k),
      inertia: 0,
      iterations: 0,
      converged: true,
    };
  }
  if (k <= 0) throw new Error(`k must be positive, got ${k}`);
  if (k > n) throw new Error(`k (${k}) exceeds row count (${n})`);
  if (buf.length !== n * dim) {
    throw new Error(
      `buf length ${buf.length} does not match n*dim (${n}*${dim}=${n * dim})`,
    );
  }

  let best: LloydsPackedResult | null = null;

  for (let run = 0; run < runs; run++) {
    const runSeed = seed != null ? mixSeed(seed, k, run) : Date.now() + run;
    const rng = createRng(runSeed);
    const initCentroids = kmeansppInitPacked(buf, n, dim, k, rng);
    const result = lloydsPacked(
      buf,
      n,
      dim,
      initCentroids,
      maxIterations,
      onProgress,
    );
    if (best === null || result.inertia < best.inertia) best = result;
  }

  const r = best!;
  return {
    k,
    assignments: r.assignments,
    centroids: r.centroids,
    counts: r.counts,
    inertia: r.inertia,
    iterations: r.iterations,
    converged: r.converged,
  };
}
