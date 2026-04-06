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
  let maxScore = 1;
  if (scores.size > 0) {
    let m = -Infinity;
    for (const v of scores.values()) if (v > m) m = v;
    maxScore = m;
  }
  return { scores, maxScore };
}
