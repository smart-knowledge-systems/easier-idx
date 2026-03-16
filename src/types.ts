// ---------------------------------------------------------------------------
// Core EASIER types — domain projects implement these
// ---------------------------------------------------------------------------

/** A document to be indexed. Domain projects define TMeta. */
export interface Document<TMeta = Record<string, unknown>> {
  /** Unique identifier within the collection. */
  readonly id: string;
  /** Text to embed (structural descriptors, not verbatim content). */
  readonly embeddingText: string;
  /** Text for BM25 keyword matching (can differ from embeddingText). */
  readonly searchText: string;
  /** Domain-specific metadata returned in search results. */
  readonly metadata: TMeta;
}

/** A scored search result returned to the consumer. */
export interface SearchResult<TMeta = Record<string, unknown>> {
  readonly id: string;
  readonly cosineSimilarity: number;
  readonly bm25Score: number;
  readonly finalScore: number;
  readonly metadata: TMeta;
  readonly explanation?: ScoreExplanation;
}

/** Score breakdown for debugging/explainability. */
export interface ScoreExplanation {
  readonly cosineSimilarity: number;
  readonly normalizedBM25: number;
  readonly boosts: Record<string, number>;
  readonly formula: string;
  /** Domain-specific fields (commitBoost, parentBoost, etc.). */
  readonly [key: string]: unknown;
}

/** Scoring configuration with named boost terms. */
export interface ScoringConfig {
  /** Weight of BM25 in hybrid score: 0 = pure semantic, 1 = pure keyword. */
  readonly hybridWeight: number;
  /** Minimum cosine similarity threshold. */
  readonly minScore: number;
  /** Domain-specific boost weights (key = boost name, value = weight). */
  readonly boosts: Record<string, number>;
}

/** Embedding provider config. */
export interface EmbeddingConfig {
  readonly model: string;
  readonly dimensions: number;
  readonly provider: "openai" | "ollama" | "remote";
  readonly ollamaUrl?: string;
  readonly remoteUrl?: string;
  readonly remoteAuth?: string;
}

/** Base config every EASIER project extends. */
export interface EasierConfig {
  readonly store: "pg" | "sqlite";
  readonly pg: { host: string; port: number; database: string; user: string };
  readonly sqlite: { path: string };
  readonly embedding: EmbeddingConfig;
  readonly scoring: ScoringConfig;
  readonly costCap: { maxCostPerReindex: number | null; warnAt: number | null };
}

// ---------------------------------------------------------------------------
// Domain project contracts
// ---------------------------------------------------------------------------

/** Collector — discovers/fetches documents from an external source. */
export interface Collector<TMeta = Record<string, unknown>> {
  collect(options?: { since?: Date }): AsyncIterable<Document<TMeta>>;
}

/** DocumentStore — domain projects implement per their schema. */
export interface DocumentStore<TMeta = Record<string, unknown>> {
  upsert(doc: Document<TMeta>, embedding: number[]): Promise<void>;
  upsertBatch(
    items: Array<{ doc: Document<TMeta>; embedding: number[] }>,
  ): Promise<void>;
  vectorSearch(
    queryEmbedding: number[],
    limit: number,
  ): Promise<
    Array<{
      id: string;
      similarity: number;
      metadata: TMeta;
      searchText: string;
    }>
  >;
  remove(ids: string[]): Promise<void>;
  count(): Promise<number>;
}

/** Pipeline result after a collect-embed-store cycle. */
export interface PipelineResult {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly durationMs: number;
  readonly costUsd: number;
}

/** Store-agnostic database operations — query + run. */
export interface StoreOps {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  run: (sql: string, params?: unknown[]) => Promise<void>;
}

/**
 * @deprecated Use `StoreOps` instead. Will be removed in 0.2.0.
 */
export type SqlRunner = Pick<StoreOps, "run">;
