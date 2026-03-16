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
  StoreOps,
  /** @deprecated Use `StoreOps` instead. Will be removed in 0.2.0. */
  SqlRunner,
} from "./types";

// Embedding
export type { EmbeddingProvider } from "./embedding/provider";
export { OpenAIEmbeddingProvider } from "./embedding/providers/openai";
export { OllamaEmbeddingProvider } from "./embedding/providers/ollama";
export { RemoteEmbeddingProvider } from "./embedding/providers/remote";
export {
  getProvider,
  resetProvider,
  embed,
  embedSingle,
} from "./embedding/embedder";

// Database utilities
export {
  serializeEmbedding,
  deserializeEmbedding,
  cosineSimilarity,
} from "./db/util";
export { getSqlite, closeSqlite } from "./db/sqlite";
export type { SqliteConfig } from "./db/sqlite";
export { getPg, pgUnsafe, closePg } from "./db/pg";
export type { PgConfig } from "./db/pg";
export {
  applyMigrations,
  getCurrentSchemaVersion,
  getLatestMigrationVersion,
} from "./db/migrate";

// StoreOps factory — STEERING #2 (SQL is the API) + #6 (explicit over implicit)
export {
  createSqliteStoreOps,
  createPgStoreOps,
  pgToSqlite,
} from "./db/store";

// Search
export { tokenize, buildIndex, score as bm25Score } from "./search/bm25";
export type { BM25Index } from "./search/bm25";
export { computeHybridScore, buildExplanation } from "./search/scoring";
export type { BoostTerm, HybridScoreInput } from "./search/scoring";
export { applyRerankers } from "./search/rerank";
export type { Reranker, RerankConfig } from "./search/rerank";
export { expandQuery, CODE_ABBREVIATIONS } from "./search/query-expansion";
export type {
  QueryRewriter,
  QueryRewriteContext,
} from "./search/query-rewriter";
export { buildBM25Context } from "./search/bm25-helpers";
export type { BM25Context } from "./search/bm25-helpers";

// Eval
export { precisionAtK, hitRateAtK, recall, mrr, ndcg } from "./eval/metrics";
export type { EvalQuery, EvalResult, EvalSummary } from "./eval/types";
export { evaluateGates, allGatesPassed } from "./eval/gate";
export type { QualityGate, GateResult } from "./eval/gate";

// Config
export {
  loadConfig,
  getGlobalConfigPath,
  writeGlobalConfig,
  deepMerge,
} from "./config/config";

// Cost — STEERING #4 (cost sensitivity drives architecture)
export {
  PRICING,
  registerPricing,
  withCostContext,
  computeCostUsd,
  recordCost,
  getProjectedCost,
  checkCostCap,
  getCostSummary,
} from "./cost/cost";
export type { CostSummaryRow } from "./cost/cost";

// Logging
export {
  initLogging,
  logEvent,
  setCorrelationContext,
  getSessionId,
  hashPath,
  withTimingSync,
  withTimingAsync,
} from "./logging/logging";

// CLI
export { parseArgs, flag, hasFlag, warnUnknownFlags } from "./cli/cli";
export type { ParsedArgs } from "./cli/cli";
