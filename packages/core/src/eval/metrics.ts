// ---------------------------------------------------------------------------
// Retrieval evaluation metrics — pure functions, no domain coupling
// ---------------------------------------------------------------------------

/** Precision@K: fraction of top-K results that are relevant. */
export function precisionAtK(
  returnedIds: string[],
  expectedIds: string[],
  k: number,
): number {
  if (expectedIds.length === 0) return returnedIds.length === 0 ? 1 : 0;
  const topK = returnedIds.slice(0, k);
  const hits = topK.filter((id) => expectedIds.includes(id)).length;
  return hits / k;
}

/** HitRate@K: fraction of expected items found in top-K results. */
export function hitRateAtK(
  returnedIds: string[],
  expectedIds: string[],
  k: number,
): number {
  if (expectedIds.length === 0) return returnedIds.length === 0 ? 1 : 0;
  const topK = returnedIds.slice(0, k);
  const hits = topK.filter((id) => expectedIds.includes(id)).length;
  return hits / Math.min(k, expectedIds.length);
}

/** Recall: fraction of expected items found anywhere in the returned list. */
export function recall(returnedIds: string[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return returnedIds.length === 0 ? 1 : 0;
  const hits = expectedIds.filter((id) => returnedIds.includes(id)).length;
  return hits / expectedIds.length;
}

/** Mean Reciprocal Rank: 1 / rank of the first relevant result. */
export function mrr(returnedIds: string[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return returnedIds.length === 0 ? 1 : 0;
  for (let i = 0; i < returnedIds.length; i++) {
    if (expectedIds.includes(returnedIds[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/** Normalized Discounted Cumulative Gain at K. */
export function ndcg(
  returnedIds: string[],
  expectedIds: string[],
  k = 10,
): number {
  if (expectedIds.length === 0) return returnedIds.length === 0 ? 1 : 0;

  let dcg = 0;
  const topK = returnedIds.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    const rel = expectedIds.includes(topK[i]) ? 1 : 0;
    dcg += rel / Math.log2(i + 2);
  }

  let idcg = 0;
  const idealCount = Math.min(expectedIds.length, k);
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}
