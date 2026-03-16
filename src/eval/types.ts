// ---------------------------------------------------------------------------
// Eval types — domain-agnostic evaluation structures
// ---------------------------------------------------------------------------

/** A single evaluation query with expected results. */
export interface EvalQuery<TMeta = Record<string, unknown>> {
  readonly id: string;
  readonly query: string;
  readonly expectedIds: string[];
  readonly description?: string;
  readonly tags?: string[];
  readonly metadata?: TMeta;
}

/** Result of evaluating a single query. */
export interface EvalResult {
  readonly queryId: string;
  readonly query: string;
  readonly precisionAtK: number;
  readonly hitRateAtK: number;
  readonly recall: number;
  readonly mrr: number;
  readonly ndcg: number;
  readonly returnedIds: string[];
  readonly expectedIds: string[];
}

/** Aggregate summary across all eval queries. */
export interface EvalSummary {
  readonly configName: string;
  readonly avgPrecisionAtK: number;
  readonly avgHitRateAtK: number;
  readonly avgRecall: number;
  readonly avgMrr: number;
  readonly avgNdcg: number;
  readonly results: EvalResult[];
  readonly timestamp: string;
}
