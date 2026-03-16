// ---------------------------------------------------------------------------
// BM25 index helpers — standard glue between BM25 scoring and hybrid search
// STEERING #5 (don't duplicate derivable logic — this computes once, reuse)
// ---------------------------------------------------------------------------

import { buildIndex as buildBM25Index, score as scoreBM25 } from "./bm25";

export interface BM25Context {
  readonly scores: Map<string, number>;
  readonly maxScore: number;
}

export function buildBM25Context(
  docs: Array<{ id: string; text: string }>,
  query: string,
): BM25Context {
  if (docs.length === 0) return { scores: new Map(), maxScore: 1 };
  const index = buildBM25Index(docs);
  const scores = scoreBM25(index, query);
  const maxScore = scores.size > 0 ? Math.max(...scores.values()) : 1;
  return { scores, maxScore };
}
