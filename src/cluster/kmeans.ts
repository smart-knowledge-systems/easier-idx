// ---------------------------------------------------------------------------
// K-means clustering — cosine distance, k-means++ initialization
// ---------------------------------------------------------------------------

import type {
  Cluster,
  ClusterAssignment,
  ClusterResult,
  KMeansOptions,
} from "./types";

// ── Vector math (Float64Array for hot loops) ────────────────────────────

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalizeInPlace(v: Float64Array): void {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
}

function cosineDistance(a: Float64Array, b: Float64Array): number {
  return 1 - dot(a, b);
}

// ── Seeded PRNG (xoshiro128**) ──────────────────────────────────────────

function createRng(seed: number): () => number {
  let s0 = seed >>> 0 || 1;
  let s1 = (seed * 2654435761) >>> 0 || 1;
  let s2 = (seed * 2246822519) >>> 0 || 1;
  let s3 = (seed * 3266489917) >>> 0 || 1;
  return () => {
    const result = (((s1 * 5) << 7) | ((s1 * 5) >>> 25)) * 9;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);
    return (result >>> 0) / 4294967296;
  };
}

// ── K-means++ initialization ────────────────────────────────────────────

function kmeansppInit(
  vecs: Float64Array[],
  k: number,
  rng: () => number,
): Float64Array[] {
  const n = vecs.length;
  const centroids: Float64Array[] = [];

  // First centroid: random
  const firstIdx = Math.floor(rng() * n);
  centroids.push(new Float64Array(vecs[firstIdx]));

  // Distance from each point to its nearest centroid
  const minDist = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < k; c++) {
    const prev = centroids[c - 1];

    // Update min distances with the new centroid
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const d = cosineDistance(vecs[i], prev);
      if (d < minDist[i]) minDist[i] = d;
      totalWeight += minDist[i] * minDist[i]; // D² weighting
    }

    // Weighted random selection
    let target = rng() * totalWeight;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      target -= minDist[i] * minDist[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }

    centroids.push(new Float64Array(vecs[chosen]));
  }

  return centroids;
}

// ── Lloyd's algorithm ───────────────────────────────────────────────────

interface LloydsResult {
  centroids: Float64Array[];
  assignments: number[];
  inertia: number;
  iterations: number;
  converged: boolean;
}

function lloyds(
  vecs: Float64Array[],
  initialCentroids: Float64Array[],
  maxIterations: number,
  onProgress?: (iteration: number, inertia: number) => void,
): LloydsResult {
  const n = vecs.length;
  const k = initialCentroids.length;
  const dim = vecs[0].length;

  // Clone centroids so we don't mutate input
  const centroids = initialCentroids.map((c) => new Float64Array(c));
  const assignments = new Int32Array(n);
  let converged = false;
  let inertia = 0;

  let iter: number;
  for (iter = 0; iter < maxIterations; iter++) {
    // ── Assignment step ──
    let changed = 0;
    inertia = 0;

    for (let i = 0; i < n; i++) {
      let bestDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < k; c++) {
        const d = cosineDistance(vecs[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          bestCluster = c;
        }
      }

      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed++;
      }
      inertia += bestDist;
    }

    onProgress?.(iter, inertia);

    if (changed === 0) {
      converged = true;
      break;
    }

    // ── Update step ──
    const counts = new Int32Array(k);
    const sums: Float64Array[] = Array.from(
      { length: k },
      () => new Float64Array(dim),
    );

    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const sum = sums[c];
      const vec = vecs[i];
      for (let d = 0; d < dim; d++) sum[d] += vec[d];
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      const sum = sums[c];
      const count = counts[c];
      for (let d = 0; d < dim; d++) centroids[c][d] = sum[d] / count;
      normalizeInPlace(centroids[c]);
    }
  }

  return {
    centroids,
    assignments: Array.from(assignments),
    inertia,
    iterations: iter + (converged ? 1 : 0),
    converged,
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * K-means clustering on pre-computed embeddings using cosine distance.
 *
 * Uses k-means++ initialization and Lloyd's algorithm. All vectors are
 * L2-normalized internally for cosine distance computation.
 *
 * @param items - Documents with embeddings to cluster.
 * @param k - Number of clusters.
 * @param options - Optional tuning parameters.
 * @returns Full cluster result with assignments and quality metrics.
 */
export function kmeans(
  items: readonly { id: string; embedding: number[] }[],
  k: number,
  options?: KMeansOptions,
): ClusterResult {
  const {
    maxIterations = 100,
    runs = 1,
    seed,
    onProgress,
  } = options ?? {};

  if (items.length === 0) {
    return {
      k,
      clusters: [],
      assignments: [],
      silhouette: 0,
      iterations: 0,
      converged: true,
    };
  }

  if (k <= 0) throw new Error(`k must be positive, got ${k}`);
  if (k > items.length) throw new Error(`k (${k}) exceeds item count (${items.length})`);

  // Normalize all vectors once
  const vecs: Float64Array[] = items.map((item) => {
    const v = new Float64Array(item.embedding);
    normalizeInPlace(v);
    return v;
  });

  let bestResult: LloydsResult | null = null;

  for (let run = 0; run < runs; run++) {
    const runSeed = seed != null ? seed + run : Date.now() + run;
    const rng = createRng(runSeed);
    const initCentroids = kmeansppInit(vecs, k, rng);
    const result = lloyds(vecs, initCentroids, maxIterations, onProgress);

    if (bestResult === null || result.inertia < bestResult.inertia) {
      bestResult = result;
    }
  }

  const result = bestResult!;

  // Build cluster objects
  const clusterMembers: string[][] = Array.from({ length: k }, () => []);
  const assignments: ClusterAssignment[] = [];

  for (let i = 0; i < items.length; i++) {
    const clusterId = String(result.assignments[i]);
    const distance = cosineDistance(vecs[i], result.centroids[result.assignments[i]]);

    clusterMembers[result.assignments[i]].push(items[i].id);
    assignments.push({
      id: items[i].id,
      clusterId,
      distance,
    });
  }

  const clusters: Cluster[] = result.centroids.map((centroid, idx) => ({
    id: String(idx),
    centroid: Array.from(centroid),
    memberIds: clusterMembers[idx],
    size: clusterMembers[idx].length,
  }));

  // Compute silhouette (sampled for large datasets)
  const silhouette = sampledSilhouette(vecs, result.assignments, k);

  return {
    k,
    clusters,
    assignments,
    silhouette,
    iterations: result.iterations,
    converged: result.converged,
  };
}

/**
 * Run k-means for a range of k values and return results sorted by silhouette.
 *
 * Useful for finding the optimal k without writing a loop.
 *
 * @param items - Documents with embeddings.
 * @param kRange - Min and max k to test (inclusive).
 * @param options - Shared options applied to each run.
 * @returns Array of results sorted by silhouette descending (best first).
 */
export function kmeansSearch(
  items: readonly { id: string; embedding: number[] }[],
  kRange: { min: number; max: number },
  options?: KMeansOptions,
): ClusterResult[] {
  const results: ClusterResult[] = [];

  for (let k = kRange.min; k <= kRange.max; k++) {
    if (k > items.length) break;
    results.push(kmeans(items, k, options));
  }

  return results.sort((a, b) => b.silhouette - a.silhouette);
}

// ── Sampled silhouette (internal) ───────────────────────────────────────

/**
 * Compute silhouette score, sampling for large datasets.
 * For n <= 2000, computes exact. Otherwise, samples 2000 evenly spaced points.
 */
function sampledSilhouette(
  vecs: Float64Array[],
  assignments: number[],
  k: number,
  maxSample = 2000,
): number {
  const n = vecs.length;
  if (n <= 1 || k <= 1) return 0;

  // Build cluster index
  const clusterIndices: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) clusterIndices[assignments[i]].push(i);

  // Sample indices
  let sampleIndices: number[];
  if (n <= maxSample) {
    sampleIndices = Array.from({ length: n }, (_, i) => i);
  } else {
    sampleIndices = [];
    const step = n / maxSample;
    for (let s = 0; s < maxSample; s++) {
      sampleIndices.push(Math.floor(s * step));
    }
  }

  let totalSilhouette = 0;
  const MAX_INTRA = 200; // Cap intra-cluster comparisons

  for (const i of sampleIndices) {
    const ci = assignments[i];
    const myCluster = clusterIndices[ci];

    // a(i) = mean distance to own cluster
    let a = 0;
    if (myCluster.length <= 1) {
      a = 0;
    } else {
      const limit = Math.min(myCluster.length, MAX_INTRA);
      let count = 0;
      const step = myCluster.length <= MAX_INTRA ? 1 : myCluster.length / MAX_INTRA;
      for (let s = 0; s < limit; s++) {
        const j = myCluster[Math.floor(s * step)];
        if (j === i) continue;
        a += cosineDistance(vecs[i], vecs[j]);
        count++;
      }
      a = count > 0 ? a / count : 0;
    }

    // b(i) = min mean distance to other clusters
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci) continue;
      const otherCluster = clusterIndices[c];
      if (otherCluster.length === 0) continue;

      let meanDist = 0;
      const limit = Math.min(otherCluster.length, MAX_INTRA);
      const step = otherCluster.length <= MAX_INTRA ? 1 : otherCluster.length / MAX_INTRA;
      for (let s = 0; s < limit; s++) {
        const j = otherCluster[Math.floor(s * step)];
        meanDist += cosineDistance(vecs[i], vecs[j]);
      }
      meanDist /= limit;
      if (meanDist < b) b = meanDist;
    }

    const maxAB = Math.max(a, b);
    totalSilhouette += maxAB === 0 ? 0 : (b - a) / maxAB;
  }

  return totalSilhouette / sampleIndices.length;
}
