// ---------------------------------------------------------------------------
// Silhouette score — packed Float32 buffer entry point
//
// Mirrors silhouetteScore() but reads from a row-major Float32 buffer plus an
// Int32Array of cluster indices, so callers using kmeansPacked don't need to
// repack into boxed objects just to score a run.
// ---------------------------------------------------------------------------

import { dotPacked } from "./vecmath";

interface SilhouettePackedOptions {
  /** Cap on sampled points used to estimate the score. Default 2000. */
  readonly sampleSize?: number;
  /** Cap on intra/inter-cluster comparisons per sampled point. Default 200. */
  readonly maxIntraCluster?: number;
}

/**
 * Compute the silhouette score for a packed-buffer clustering result.
 *
 * Vectors must already be L2-normalized (the same invariant kmeansPacked
 * assumes). Cosine distance reduces to `1 - dot`.
 *
 * For large `n`, samples evenly-spaced points and caps intra-/inter-cluster
 * comparisons per sampled point — same defaults as `silhouetteScore`.
 *
 * @returns score in [-1, 1]; higher is better.
 */
export function silhouettePacked(
  buf: Float32Array,
  n: number,
  dim: number,
  assignments: Int32Array,
  k: number,
  options?: SilhouettePackedOptions,
): number {
  const { sampleSize = 2000, maxIntraCluster = 200 } = options ?? {};

  if (n <= 1 || k <= 1) return 0;
  if (assignments.length !== n) {
    throw new Error(
      `assignments length ${assignments.length} does not match n=${n}`,
    );
  }
  if (buf.length !== n * dim) {
    throw new Error(
      `buf length ${buf.length} does not match n*dim (${n}*${dim}=${n * dim})`,
    );
  }

  // Build cluster index: row indices grouped by cluster.
  const clusterIndices: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) clusterIndices[assignments[i]].push(i);

  // Empty clusters reduce the effective k for the b(i) min.
  let nonEmpty = 0;
  for (let c = 0; c < k; c++) if (clusterIndices[c].length > 0) nonEmpty++;
  if (nonEmpty <= 1) return 0;

  // Sample points to score.
  let sampleIndices: number[];
  if (n <= sampleSize) {
    sampleIndices = Array.from({ length: n }, (_, i) => i);
  } else {
    sampleIndices = [];
    const step = n / sampleSize;
    for (let s = 0; s < sampleSize; s++) {
      sampleIndices.push(Math.floor(s * step));
    }
  }

  let total = 0;

  for (const i of sampleIndices) {
    const ci = assignments[i];
    const myCluster = clusterIndices[ci];
    const iOff = i * dim;

    // a(i) = mean cosine distance to own cluster.
    let a = 0;
    if (myCluster.length > 1) {
      let sum = 0;
      let count = 0;
      const limit = Math.min(myCluster.length, maxIntraCluster);
      const step =
        myCluster.length <= maxIntraCluster
          ? 1
          : myCluster.length / maxIntraCluster;
      for (let s = 0; s < limit; s++) {
        const j = myCluster[Math.floor(s * step)];
        if (j === i) continue;
        sum += 1 - dotPacked(buf, iOff, buf, j * dim, dim);
        count++;
      }
      a = count > 0 ? sum / count : 0;
    }

    // b(i) = min mean distance to any other cluster.
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci) continue;
      const other = clusterIndices[c];
      if (other.length === 0) continue;

      let sum = 0;
      const limit = Math.min(other.length, maxIntraCluster);
      const step =
        other.length <= maxIntraCluster ? 1 : other.length / maxIntraCluster;
      for (let s = 0; s < limit; s++) {
        const j = other[Math.floor(s * step)];
        sum += 1 - dotPacked(buf, iOff, buf, j * dim, dim);
      }
      const mean = sum / limit;
      if (mean < b) b = mean;
    }

    const maxAB = Math.max(a, b);
    total += maxAB === 0 ? 0 : (b - a) / maxAB;
  }

  return total / sampleIndices.length;
}
