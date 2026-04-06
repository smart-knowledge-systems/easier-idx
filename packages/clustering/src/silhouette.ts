// ---------------------------------------------------------------------------
// Silhouette score — standalone for eval/quality gating
// ---------------------------------------------------------------------------

import { cosineDistance, normalizeVec } from "./vecmath";

/**
 * Compute the silhouette score for a set of clustered embeddings.
 *
 * Uses cosine distance (1 - dot product on L2-normalized vectors).
 * Samples for large datasets to keep computation tractable.
 *
 * @param items - Items with embeddings and their cluster assignments.
 * @param options - Sampling configuration.
 * @returns Silhouette score in [-1, 1]. Higher is better.
 */
export function silhouetteScore(
  items: readonly { embedding: number[]; clusterId: string }[],
  options?: { sampleSize?: number; maxIntraCluster?: number },
): number {
  const { sampleSize = 2000, maxIntraCluster = 200 } = options ?? {};
  const n = items.length;

  if (n <= 1) return 0;

  // Normalize all vectors
  const vecs: Float64Array[] = items.map((item) => normalizeVec(item.embedding));

  // Build cluster index
  const clusterIds = [...new Set(items.map((item) => item.clusterId))];
  if (clusterIds.length <= 1) return 0;

  const clusterIndex = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const cid = items[i].clusterId;
    if (!clusterIndex.has(cid)) clusterIndex.set(cid, []);
    clusterIndex.get(cid)!.push(i);
  }

  // Sample indices
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

  let totalSilhouette = 0;

  for (const i of sampleIndices) {
    const ci = items[i].clusterId;
    const myCluster = clusterIndex.get(ci)!;

    // a(i) = mean distance to own cluster
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
        sum += cosineDistance(vecs[i], vecs[j]);
        count++;
      }
      a = count > 0 ? sum / count : 0;
    }

    // b(i) = min mean distance to any other cluster
    let b = Infinity;
    for (const [cid, indices] of clusterIndex) {
      if (cid === ci || indices.length === 0) continue;

      let sum = 0;
      const limit = Math.min(indices.length, maxIntraCluster);
      const step =
        indices.length <= maxIntraCluster
          ? 1
          : indices.length / maxIntraCluster;
      for (let s = 0; s < limit; s++) {
        sum += cosineDistance(vecs[i], vecs[indices[Math.floor(s * step)]]);
      }
      const mean = sum / limit;
      if (mean < b) b = mean;
    }

    const maxAB = Math.max(a, b);
    totalSilhouette += maxAB === 0 ? 0 : (b - a) / maxAB;
  }

  return totalSilhouette / sampleIndices.length;
}
