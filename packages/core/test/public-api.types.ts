import {
  CODE_ABBREVIATIONS,
  allGatesPassed,
  applyMigrations,
  applyRerankers,
  bm25Score,
  buildBM25Context,
  buildExplanation,
  buildIndex,
  classify,
  closePg,
  closeSqlite,
  computeHybridScore,
  cosineSimilarity,
  createPgStoreOps,
  createSqliteStoreOps,
  deepMerge,
  deserializeEmbedding,
  evaluateGates,
  expandQuery,
  extractTopTerms,
  getCurrentSchemaVersion,
  getGlobalConfigPath,
  getLatestMigrationVersion,
  getPg,
  getSessionId,
  getSqlite,
  hashPath,
  hitRateAtK,
  initLogging,
  kmeans,
  kmeansSearch,
  loadConfig,
  logEvent,
  mrr,
  ndcg,
  pgToSqlite,
  pgUnsafe,
  precisionAtK,
  recall,
  sampleRepresentative,
  serializeEmbedding,
  setCorrelationContext,
  silhouetteScore,
  tokenize,
  voteAll,
  voteDeepest,
  voteMostSpecific,
  voteSubset,
  withTimingAsync,
  withTimingSync,
  writeGlobalConfig,
} from "@easier/core";
import type {
  BM25Context,
  BM25Index,
  BoostTerm,
  Collector,
  Cluster,
  ClusterAssignment,
  ClusterDef,
  ClusterProvider,
  ClusterResult,
  ClassifyOptions,
  ClassifyResult,
  Document,
  DocumentStore,
  EasierConfig,
  EvalQuery,
  EvalResult,
  EvalSummary,
  GateResult,
  HybridScoreInput,
  KMeansOptions,
  LabeledItem,
  PgConfig,
  PipelineResult,
  QualityGate,
  QueryRewriteContext,
  QueryRewriter,
  RerankConfig,
  Reranker,
  ScoreExplanation,
  ScoringConfig,
  SearchResult,
  SqlRunner,
  SqliteConfig,
  StoreOps,
  VotingStrategy,
} from "@easier/core";
import type { SqliteConfig as SqliteConfigSubpath } from "@easier/core/db/sqlite";
import type { PgConfig as PgConfigSubpath } from "@easier/core/db/pg";
import type {
  BoostTerm as BoostTermSubpath,
  HybridScoreInput as HybridScoreInputSubpath,
} from "@easier/core/search";
import type { BM25Index as BM25IndexSubpath } from "@easier/core/search/bm25";
import type { BM25Context as BM25ContextSubpath } from "@easier/core/search/bm25-helpers";
import type {
  GateResult as GateResultSubpath,
  QualityGate as QualityGateSubpath,
} from "@easier/core/eval/gate";

interface ExampleMeta {
  year: number;
}

declare const clusterItems: readonly { id: string; embedding: number[] }[];

type PublicApiTypeSmoke = [
  Document<ExampleMeta>,
  SearchResult<ExampleMeta>,
  ScoreExplanation,
  ScoringConfig,
  EasierConfig,
  Collector<ExampleMeta>,
  Cluster,
  ClusterAssignment,
  ClusterDef,
  ClusterProvider,
  ClusterResult,
  ClassifyOptions,
  ClassifyResult,
  DocumentStore<ExampleMeta>,
  PipelineResult,
  StoreOps,
  SqlRunner,
  BM25Index,
  BoostTerm,
  HybridScoreInput,
  Reranker<ExampleMeta>,
  RerankConfig,
  QueryRewriter,
  QueryRewriteContext,
  BM25Context,
  EvalQuery,
  EvalResult,
  EvalSummary,
  QualityGate,
  GateResult,
  SqliteConfig,
  PgConfig,
  KMeansOptions,
  LabeledItem,
  SqliteConfigSubpath,
  PgConfigSubpath,
  BoostTermSubpath,
  HybridScoreInputSubpath,
  BM25IndexSubpath,
  BM25ContextSubpath,
  QualityGateSubpath,
  GateResultSubpath,
  VotingStrategy,
];

declare const ops: StoreOps;
declare const sqliteDb: ReturnType<typeof getSqlite>;
declare const pgDb: ReturnType<typeof getPg>;
declare const results: readonly SearchResult<ExampleMeta>[];
declare const reranker: Reranker<ExampleMeta>;
declare const evalSummary: EvalSummary;

export type { PublicApiTypeSmoke };

export async function publicApiCompileSmoke(): Promise<void> {
  const bm25Index = buildIndex([{ id: "doc-1", text: "alpha beta" }]);
  const bm25Scores = bm25Score(bm25Index, "alpha");
  const hybridScore = computeHybridScore(0.8, {
    bm25Raw: 2,
    bm25Max: 4,
    hybridWeight: 0.25,
    boosts: { recency: { weight: 0.1, value: 0.5 } },
  });

  const reranked = await applyRerankers(results, [reranker], {
    enabled: true,
    weights: { [reranker.name]: 0.2 },
  });

  const gates = evaluateGates(evalSummary, [
    { metric: "precisionAtK", threshold: 0.8 },
    { metric: "mrr", threshold: 0.7 },
  ]);

  const exportedValues: unknown[] = [
    serializeEmbedding([1, 2, 3]),
    deserializeEmbedding(serializeEmbedding([1, 2, 3])),
    cosineSimilarity([1, 0], [0, 1]),
    createSqliteStoreOps(sqliteDb),
    createPgStoreOps(pgDb),
    pgToSqlite("SELECT * FROM items WHERE id = $1"),
    getSqlite({ path: ":memory:" }, process.cwd()),
    closeSqlite(),
    getPg(
      { host: "localhost", port: 5432, database: "easier", user: "app" },
      25,
    ),
    pgUnsafe(
      { host: "localhost", port: 5432, database: "easier", user: "app" },
      "SELECT 1",
    ),
    closePg(),
    applyMigrations("sqlite", "./migrations", sqliteDb),
    getCurrentSchemaVersion("sqlite", sqliteDb),
    getLatestMigrationVersion("./migrations", "sqlite"),
    tokenize("getUserAuth"),
    bm25Index,
    bm25Scores,
    buildExplanation(
      0.8,
      { bm25Raw: 2, bm25Max: 4, hybridWeight: 0.25 },
      hybridScore,
    ),
    hybridScore,
    reranked,
    expandQuery("getUserAuth", CODE_ABBREVIATIONS),
    buildBM25Context([{ id: "doc-1", text: "alpha beta" }], "alpha"),
    kmeans(clusterItems, 2),
    kmeansSearch(clusterItems, { min: 2, max: 3 }),
    classify(clusterItems, [], []),
    voteAll(),
    voteSubset(new Set(["cluster-a"])),
    voteDeepest(new Map([["cluster-a", 1]])),
    voteMostSpecific(new Map([["cluster-a", 1]])),
    silhouetteScore([
      { embedding: [1, 0], clusterId: "cluster-a" },
      { embedding: [0, 1], clusterId: "cluster-b" },
    ]),
    sampleRepresentative(
      { id: "cluster-a", centroid: [1, 0], memberIds: ["a"], size: 1 },
      [{ id: "a", embedding: [1, 0] }],
    ),
    extractTopTerms(["alpha beta", "alpha gamma"]),
    precisionAtK(["doc-1"], ["doc-1"], 1),
    hitRateAtK(["doc-1"], ["doc-1"], 1),
    recall(["doc-1"], ["doc-1"]),
    mrr(["doc-1"], ["doc-1"]),
    ndcg(["doc-1"], ["doc-1"], 1),
    gates,
    allGatesPassed(gates),
    loadConfig<EasierConfig>("easier", {} as EasierConfig),
    getGlobalConfigPath("easier"),
    writeGlobalConfig<EasierConfig>("easier", { store: "sqlite" }),
    deepMerge({ scoring: { alpha: 1 } }, { scoring: { beta: 2 } }),
    initLogging({ domains: ["embed", "migrate"] }),
    logEvent({ event: "embed.complete" }),
    setCorrelationContext({ repoId: "repo-1" }),
    getSessionId(),
    hashPath("/tmp/example.ts"),
    withTimingSync("embed.complete", { count: 1 }, () => 1),
    withTimingAsync("embed.complete", { count: 1 }, async () => 1),
  ];

  void exportedValues;
}
