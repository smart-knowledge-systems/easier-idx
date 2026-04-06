# Public API

This document defines the supported public API for `@easier-idx/core`.

Even while the package is in `0.x`, the symbols listed here are treated as the semver contract. Removing, renaming, or changing them incompatibly should come with:

1. A major version bump.
2. An update to this document.
3. An update to the API contract tests in [`test/public-api.contract.ts`](/Users/russfugal/repo/easier/test/public-api.contract.ts), [`test/public-api.test.ts`](/Users/russfugal/repo/easier/test/public-api.test.ts), and [`test/public-api.types.ts`](/Users/russfugal/repo/easier/test/public-api.types.ts).

The package currently targets Bun at runtime. The public API below covers the package root plus the documented subpath entrypoints.

## Root Entrypoint

Specifier: `@easier-idx/core`

### Runtime exports

| Area | Symbols |
| --- | --- |
| Database | `serializeEmbedding`, `deserializeEmbedding`, `cosineSimilarity`, `getSqlite`, `closeSqlite`, `getPg`, `pgUnsafe`, `closePg`, `applyMigrations`, `getCurrentSchemaVersion`, `getLatestMigrationVersion`, `createSqliteStoreOps`, `createPgStoreOps`, `pgToSqlite` |
| Search | `tokenize`, `buildIndex`, `bm25Score`, `computeHybridScore`, `buildExplanation`, `applyRerankers`, `expandQuery`, `CODE_ABBREVIATIONS`, `buildBM25Context` |
| Eval | `precisionAtK`, `hitRateAtK`, `recall`, `mrr`, `ndcg`, `evaluateGates`, `allGatesPassed` |
| Config | `loadConfig`, `getGlobalConfigPath`, `writeGlobalConfig`, `deepMerge` |
| Logging | `initLogging`, `logEvent`, `setCorrelationContext`, `getSessionId`, `hashPath`, `withTimingSync`, `withTimingAsync` (re-exported from `@easier-idx/logging`) |
| Cluster | `kmeans`, `kmeansSearch`, `classify`, `voteAll`, `voteSubset`, `voteDeepest`, `voteMostSpecific`, `silhouetteScore`, `sampleRepresentative`, `extractTopTerms` (re-exported from `@easier-idx/clustering`) |

### Type exports

| Area | Symbols |
| --- | --- |
| Core | `Document`, `SearchResult`, `ScoreExplanation`, `ScoringConfig`, `EasierConfig`, `Collector`, `DocumentStore`, `PipelineResult`, `StoreOps`, `SqlRunner` |
| Search | `BM25Index`, `BoostTerm`, `HybridScoreInput`, `Reranker`, `RerankConfig`, `QueryRewriter`, `QueryRewriteContext`, `BM25Context` |
| Eval | `EvalQuery`, `EvalResult`, `EvalSummary`, `QualityGate`, `GateResult` |
| Database | `SqliteConfig`, `SqliteDatabase`, `SqliteStatement`, `PgClient`, `PgConfig`, `PgTx` |
| Cluster | `Cluster`, `ClusterAssignment`, `ClusterResult`, `KMeansOptions`, `ClusterDef`, `LabeledItem`, `VotingStrategy`, `ClassifyResult`, `ClassifyOptions`, `ClusterProvider` |

## Subpath Entrypoints

| Specifier | Runtime exports | Type exports |
| --- | --- | --- |
| `@easier-idx/core/db` | `serializeEmbedding`, `deserializeEmbedding`, `cosineSimilarity` | None |
| `@easier-idx/core/db/store` | `createSqliteStoreOps`, `createPgStoreOps`, `pgToSqlite` | None |
| `@easier-idx/core/db/sqlite` | `getSqlite`, `closeSqlite` | `SqliteConfig` |
| `@easier-idx/core/db/pg` | `getPg`, `pgUnsafe`, `closePg` | `PgConfig` |
| `@easier-idx/core/db/migrate` | `applyMigrations`, `getCurrentSchemaVersion`, `getLatestMigrationVersion`, `migrationChecksum` | None |
| `@easier-idx/core/search` | `computeHybridScore`, `buildExplanation` | `BoostTerm`, `HybridScoreInput` |
| `@easier-idx/core/search/bm25` | `tokenize`, `buildIndex`, `score` | `BM25Index` |
| `@easier-idx/core/search/bm25-helpers` | `buildBM25Context` | `BM25Context` |
| `@easier-idx/core/eval/gate` | `evaluateGates`, `allGatesPassed` | `QualityGate`, `GateResult` |
| `@easier-idx/core/eval/metrics` | `precisionAtK`, `hitRateAtK`, `recall`, `mrr`, `ndcg` | None |
| `@easier-idx/core/config` | `loadConfig`, `getGlobalConfigPath`, `writeGlobalConfig`, `deepMerge` | None |
| `@easier-idx/core/cluster` | `kmeans`, `kmeansSearch` (re-exported from `@easier-idx/clustering`) | None |
| `@easier-idx/core/cluster/classify` | `classify`, `voteAll`, `voteSubset`, `voteDeepest`, `voteMostSpecific` (re-exported from `@easier-idx/clustering`) | None |
| `@easier-idx/core/cluster/silhouette` | `silhouetteScore` (re-exported from `@easier-idx/clustering`) | None |
| `@easier-idx/core/cluster/describe` | `sampleRepresentative`, `extractTopTerms` (re-exported from `@easier-idx/clustering`) | None |

## Enforcement

- `bun test` imports the package root and each documented subpath and checks the expected runtime exports remain available.
- `bun run check` typechecks [`test/public-api.types.ts`](/Users/russfugal/repo/easier/test/public-api.types.ts), which protects the documented type exports and representative call signatures.
- GitHub Actions runs `bun run check`, `bun test`, and packed-package smoke tests under Bun and Node before release.
- Additive API changes are allowed, but removals or incompatible changes should update this document and ship in a major release.
