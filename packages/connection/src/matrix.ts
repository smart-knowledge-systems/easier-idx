import { cosineSimilarity } from "@easier/core/db";
import type { SimilarityItem, SimilarityPair } from "./types";

/**
 * Compute pairwise cosine similarity between two sets of items.
 * Returns a 2D array: result[i][j] is the similarity between setA[i] and setB[j].
 *
 * For large-scale use, prefer `pgRankByVector` from `@easier/core/db/vector` instead,
 * which pushes computation to the database with indexed ANN.
 */
export function computeSimilarityMatrix(
  setA: readonly SimilarityItem[],
  setB: readonly SimilarityItem[],
): SimilarityPair[][] {
  return setA.map((a) =>
    setB.map((b) => ({
      aId: a.id,
      bId: b.id,
      similarity: cosineSimilarity(a.embedding, b.embedding),
    })),
  );
}
