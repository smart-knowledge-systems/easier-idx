/**
 * Find the similarity threshold that yields approximately `targetPairs` pairs.
 * Returns the Kth-largest similarity value, where K = targetPairs.
 * Returns 0 if targetPairs >= total available pairs.
 */
export function findThreshold<T extends { similarity: number }>(
  matrix: readonly (readonly T[])[],
  targetPairs: number,
): number {
  let totalCount = 0;
  for (const row of matrix) totalCount += row.length;
  if (targetPairs >= totalCount) return 0;
  if (targetPairs <= 0) return Infinity;

  const sims: number[] = [];
  for (const row of matrix) {
    for (const item of row) {
      sims.push(item.similarity);
    }
  }
  sims.sort((a, b) => b - a);
  return sims[Math.min(targetPairs - 1, sims.length - 1)];
}

/**
 * Filter a similarity matrix to pairs at or above the given threshold.
 * Returns a Map from row index to the filtered items for that row.
 * Rows with no items above threshold are omitted.
 */
export function getPairsAboveThreshold<T extends { similarity: number }>(
  matrix: readonly (readonly T[])[],
  threshold: number,
): Map<number, T[]> {
  const result = new Map<number, T[]>();
  for (let i = 0; i < matrix.length; i++) {
    const filtered = matrix[i].filter((item) => item.similarity >= threshold);
    if (filtered.length > 0) {
      result.set(i, filtered);
    }
  }
  return result;
}
