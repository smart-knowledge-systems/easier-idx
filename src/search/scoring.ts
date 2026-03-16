// ---------------------------------------------------------------------------
// Generic hybrid scoring — cosine + BM25 + named boosts
// ---------------------------------------------------------------------------

import type { ScoreExplanation } from "../types";

export interface BoostTerm {
  readonly weight: number;
  readonly value: number;
}

export interface HybridScoreInput {
  /** Raw BM25 score for this document. */
  readonly bm25Raw: number;
  /** Max BM25 score across all candidates (for normalization). */
  readonly bm25Max: number;
  /** Weight of BM25 in hybrid score: 0 = pure semantic, 1 = pure keyword. */
  readonly hybridWeight: number;
  /** Domain-specific boost terms (key = boost name). */
  readonly boosts?: Record<string, BoostTerm>;
}

/**
 * Compute a hybrid score combining cosine similarity, BM25, and named boosts.
 *
 * Formula:
 *   semanticScore = cosine + sum(boost.weight * boost.value)
 *   normalizedBM25 = bm25Raw / bm25Max
 *   finalScore = (1 - hybridWeight) * semanticScore + hybridWeight * normalizedBM25
 */
export function computeHybridScore(
  cosine: number,
  input: HybridScoreInput,
): number {
  let boostSum = 0;
  if (input.boosts) {
    for (const boost of Object.values(input.boosts)) {
      boostSum += boost.weight * boost.value;
    }
  }

  const semanticScore = cosine + boostSum;
  const normalizedBM25 = input.bm25Max > 0 ? input.bm25Raw / input.bm25Max : 0;

  const { hybridWeight } = input;
  return hybridWeight > 0
    ? (1 - hybridWeight) * semanticScore + hybridWeight * normalizedBM25
    : semanticScore;
}

/** Build an explanation object for a scored result. */
export function buildExplanation(
  cosine: number,
  input: HybridScoreInput,
  finalScore: number,
): ScoreExplanation {
  const normalizedBM25 = input.bm25Max > 0 ? input.bm25Raw / input.bm25Max : 0;
  const boostEntries: Record<string, number> = {};
  if (input.boosts) {
    for (const [name, boost] of Object.entries(input.boosts)) {
      boostEntries[name] = boost.weight * boost.value;
    }
  }

  const boostTerms = Object.entries(boostEntries)
    .map(([name, val]) => `${name}=${val.toFixed(3)}`)
    .join(" + ");
  const boostStr = boostTerms ? ` + ${boostTerms}` : "";

  return {
    cosineSimilarity: cosine,
    normalizedBM25,
    boosts: boostEntries,
    formula: `(1-${input.hybridWeight})*[${cosine.toFixed(3)}${boostStr}] + ${input.hybridWeight}*${normalizedBM25.toFixed(3)} = ${finalScore.toFixed(3)}`,
  };
}
