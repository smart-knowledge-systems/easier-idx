// ---------------------------------------------------------------------------
// @easier-idx/core — barrel export
// ---------------------------------------------------------------------------

// Types
export type {
  Document,
  SearchResult,
  ScoreExplanation,
  ScoringConfig,
  EasierConfig,
  Collector,
  DocumentStore,
  PipelineResult,
  StoreOps,
  /** @deprecated Use `StoreOps` instead. Will be removed in 0.2.0. */
  SqlRunner,
} from "./types";

// Database utilities
export { assertSafeIdentifier } from "./db/identifiers";
export {
  serializeEmbedding,
  deserializeEmbedding,
  cosineSimilarity,
} from "./db/util";
export { getSqlite, closeSqlite } from "./db/sqlite";
export type {
  SqliteConfig,
  SqliteDatabase,
  SqliteStatement,
} from "./db/sqlite";
export { getPg, pgUnsafe, closePg } from "./db/pg";
export type { PgClient, PgConfig, PgTx } from "./db/pg";
export {
  applyMigrations,
  getCurrentSchemaVersion,
  getLatestMigrationVersion,
} from "./db/migrate";

// StoreOps factory — STEERING #2 (SQL is the API) + #6 (explicit over implicit)
export {
  createSqliteStoreOps,
  createPgStoreOps,
  createNodePgStoreOps,
  pgToSqlite,
} from "./db/store";
export type { NodePgPool } from "./db/store";

// Vector query helpers (server-side pgvector + sqlite-vec)
export {
  pgvectorInit,
  pgvectorColumn,
  pgvectorHnswIndex,
  pgSetHnswEfSearch,
  pgVectorLiteral,
  pgVectorCast,
  pgCosineSimilarity,
  pgCosineDistance,
  pgConditionalSimilarity,
  vec0CreateTable,
  sqliteKnnWhere,
  sqlitePointDistance,
  pgRankByVector,
  sqliteRankByVector,
} from "./db/vector";
export type { PgRankByVectorOpts, SqliteRankByVectorOpts } from "./db/vector";

// FTS (Postgres full-text search) helpers
export {
  pgTsvectorExpression,
  pgFtsIndex,
  pgFtsWhere,
  pgFtsRank,
  pgWebsearchWhere,
  pgHybridRank,
} from "./db/fts";
export type { TsvectorWeight, PgHybridRankOpts } from "./db/fts";

// Cache-or-generate, CAS, orphan detection, pipeline runs
export {
  ensureCached,
  casUpdate,
  detectOrphans,
  startPipelineRun,
  completePipelineRun,
  failPipelineRun,
} from "./cache";
export type {
  EnsureOpts,
  EnsureResult,
  CasUpdateOpts,
  DetectOrphansOpts,
  PipelineRunStats,
} from "./cache";

// Token usage tracking
export { emptyUsage, accumUsage } from "./usage";
export type { TokenUsage } from "./usage";

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

// Retry
export { retryWithBackoff } from "./retry";
export type { RetryOpts } from "./retry";

// Config
export {
  loadConfig,
  getGlobalConfigPath,
  writeGlobalConfig,
  deepMerge,
} from "./config/config";

// Logging (re-exported from @easier-idx/logging)
export {
  initLogging,
  logEvent,
  setCorrelationContext,
  getSessionId,
  hashPath,
  withTimingSync,
  withTimingAsync,
} from "@easier-idx/logging";

// Cluster
export { kmeans, kmeansSearch } from "./cluster/kmeans";
export {
  classify,
  voteAll,
  voteSubset,
  voteDeepest,
  voteMostSpecific,
} from "./cluster/classify";
export { silhouetteScore } from "./cluster/silhouette";
export { sampleRepresentative, extractTopTerms } from "./cluster/describe";
// Cluster types live in @easier-idx/clustering (which is core's only
// cluster runtime source). Core re-exports them here so consumers see
// the full cluster surface without depending on @easier-idx/clustering
// directly.
export type {
  Cluster,
  ClusterAssignment,
  ClusterResult,
  KMeansOptions,
  ClusterDef,
  LabeledItem,
  VotingStrategy,
  ClassifyResult,
  ClassifyOptions,
  ClusterProvider,
} from "@easier-idx/clustering";
