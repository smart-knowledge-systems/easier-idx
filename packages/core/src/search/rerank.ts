// ---------------------------------------------------------------------------
// Reranking — pluggable post-retrieval score adjustments
// ---------------------------------------------------------------------------

import type { SearchResult } from "../types";

/** A reranker computes per-result boosts to refine retrieval ordering. */
export interface Reranker<TMeta = Record<string, unknown>> {
  readonly name: string;
  computeBoosts(
    results: readonly SearchResult<TMeta>[],
  ): Promise<Map<string, number>>;
}

/** Configuration for the reranking pipeline. */
export interface RerankConfig {
  readonly enabled: boolean;
  readonly weights: Record<string, number>;
}

/**
 * Apply a set of rerankers to search results.
 * Each reranker produces per-result boosts; final adjustment is
 * sum(weight * boost) for each reranker.
 */
export async function applyRerankers<TMeta>(
  results: readonly SearchResult<TMeta>[],
  rerankers: Reranker<TMeta>[],
  config: RerankConfig,
): Promise<SearchResult<TMeta>[]> {
  if (!config.enabled || rerankers.length === 0) {
    return [...results];
  }

  const boostMaps = await Promise.all(
    rerankers.map((r) =>
      r.computeBoosts(results).then((m) => ({ name: r.name, boosts: m })),
    ),
  );

  const adjusted = results.map((result) => {
    let adjustment = 0;
    for (const { name, boosts } of boostMaps) {
      const boost = boosts.get(result.id) ?? 0;
      const weight = config.weights[name] ?? 1;
      adjustment += weight * boost;
    }
    return { ...result, finalScore: result.finalScore + adjustment };
  });

  return adjusted.sort((a, b) => b.finalScore - a.finalScore);
}
