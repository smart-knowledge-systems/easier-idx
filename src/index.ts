// ---------------------------------------------------------------------------
// @easier/core — barrel export
// ---------------------------------------------------------------------------

// Types
export type {
  Document,
  SearchResult,
  ScoreExplanation,
  ScoringConfig,
  EmbeddingConfig,
  EasierConfig,
  Collector,
  DocumentStore,
  PipelineResult,
  SqlRunner,
} from "./types";

// Embedding
export type { EmbeddingProvider } from "./embedding/provider";
export { OpenAIEmbeddingProvider } from "./embedding/providers/openai";
export { OllamaEmbeddingProvider } from "./embedding/providers/ollama";
export { getProvider, resetProvider, embed, embedSingle } from "./embedding/embedder";

// Database utilities
export { serializeEmbedding, deserializeEmbedding, cosineSimilarity } from "./db/util";
export { getSqlite, closeSqlite } from "./db/sqlite";
export type { SqliteConfig } from "./db/sqlite";
export { getPg, pgUnsafe, closePg } from "./db/pg";
export type { PgConfig } from "./db/pg";
export { applyMigrations, getCurrentSchemaVersion, getLatestMigrationVersion } from "./db/migrate";

// Search
export { tokenize, buildIndex, score as bm25Score } from "./search/bm25";
export type { BM25Index } from "./search/bm25";
export { computeHybridScore, buildExplanation } from "./search/scoring";
export type { BoostTerm, HybridScoreInput } from "./search/scoring";

// Config
export { loadConfig, getGlobalConfigPath, writeGlobalConfig, deepMerge } from "./config/config";

// Cost
export {
  PRICING,
  registerPricing,
  withCostContext,
  computeCostUsd,
  recordCost,
  getProjectedCost,
} from "./cost/cost";

// Logging
export {
  initLogging,
  logEvent,
  setCorrelationContext,
  getSessionId,
  withTimingSync,
  withTimingAsync,
} from "./logging/logging";

// CLI
export { parseArgs, flag, hasFlag, warnUnknownFlags } from "./cli/cli";
export type { ParsedArgs } from "./cli/cli";
