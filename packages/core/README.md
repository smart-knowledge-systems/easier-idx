# @easier-idx/core

Framework for building **EASIER** systems — **E**mbedding-**A**ugmented **S**emantic **I**ndex for **E**fficient **R**etrieval.

## What is EASIER?

A search pattern where:

- **Retrieval is the terminal operation.** The query returns a ranked list of matches. No generation, no prompt stuffing, no RAG pipeline.
- **The index stores descriptors, not content.** Embeddings of metadata, structure, and attributes — a function's signature and purpose rather than its implementation.
- **The consumer decides what to do with results.** Human or agent, the caller owns the next step.

This distinguishes EASIER from RAG: RAG retrieves content to feed a generator; EASIER retrieves descriptors to inform a decision.

## Install

```bash
bun add @easier-idx/core
```

Requires [Bun](https://bun.sh) runtime.

Node.js compatibility fallback is available through optional adapters. This
package declares `pg` and `better-sqlite3` as optional dependencies, lazy-loads
them on Node fallback paths, and uses [`bunfig.toml`](/Users/russfugal/repo/easier/bunfig.toml)
to skip optional installs during local `bun install`.

## Public API contract

The supported package surface is documented in [PUBLIC_API.md](PUBLIC_API.md).
`bun test` checks the runtime exports and documented subpath entrypoints, and
`bun run check` typechecks [`test/public-api.types.ts`](/Users/russfugal/repo/easier/test/public-api.types.ts)
so breaking API changes fail CI before release.

## Runtime support

`@easier-idx/core` is Bun-native first and ships Node fallbacks for the following:

- `@easier-idx/core/config`
- `@easier-idx/core/db/pg` via optional `pg`
- `@easier-idx/core/db/sqlite` via optional `better-sqlite3`

The SQLite fallback is functional for core database access, but Bun remains the
primary runtime for the full sqlite-vec path.

CI validates:

- `bun run check`
- `bun test`
- packed-package import smoke tests under Bun
- packed-package import smoke tests under Node 20 and Node 22

Cluster APIs are also part of the published package surface:

- `@easier-idx/core/cluster`
- `@easier-idx/core/cluster/classify`
- `@easier-idx/core/cluster/silhouette`
- `@easier-idx/core/cluster/describe`

## Quick start

```typescript
import {
  buildIndex, bm25Score, computeHybridScore,
  loadConfig, type EasierConfig, type Document,
} from "@easier-idx/core";

// 1. Define your document type
interface PaperMeta {
  doi: string;
  title: string;
  authors: string[];
  year: number;
}

// 2. Extend the base config
interface MyConfig extends EasierConfig {
  crossref: { politeEmail: string };
}

// 3. Load config (merges ~/.config/myapp/config.json + .myapp.json)
const config = await loadConfig<MyConfig>("myapp", defaults);

// 4. Embed with your preferred provider (see @easier-idx/embedding) and search
const queryVec = await yourEmbedder.embedSingle("transformer protein folding");
const candidates = await myStore.vectorSearch(queryVec, 100);

// 5. Score with BM25 hybrid + domain boosts
const bm25Idx = buildIndex(candidates.map(c => ({ id: c.id, text: c.searchText })));
const bm25Scores = bm25Score(bm25Idx, "transformer protein folding");
const maxBM25 = Math.max(...bm25Scores.values(), 0);

const results = candidates.map(c => ({
  ...c,
  finalScore: computeHybridScore(c.similarity, {
    bm25Raw: bm25Scores.get(c.id) ?? 0,
    bm25Max: maxBM25,
    hybridWeight: 0.3,
    boosts: {
      recency: { weight: 0.1, value: (c.metadata.year - 2000) / 25 },
    },
  }),
})).sort((a, b) => b.finalScore - a.finalScore);
```

## StoreOps — backend-agnostic database access

```typescript
import {
  getSqlite, createSqliteStoreOps,
  type StoreOps,
} from "@easier-idx/core";

// Open a connection and wrap it in StoreOps
const db = getSqlite({ path: "./my-index.db" });
const ops: StoreOps = createSqliteStoreOps(db);

// Write SQL with pg-style $1 placeholders — auto-converted for SQLite
await ops.run("INSERT INTO items (name) VALUES ($1)", ["example"]);
const rows = await ops.query<{ id: number; name: string }>("SELECT * FROM items");
```

## Database security — avoiding SQL injection

`@easier-idx/core/db/pg` exposes two query interfaces: **tagged template literals** and the **`unsafe()` method**. They have different safety guarantees.

### Tagged template literals (safe by default)

Values interpolated with `${}` are automatically parameterized — they never appear in the SQL string.

```typescript
const pg = getPg(config);

// SAFE — id is sent as $1 parameter
const rows = await pg`SELECT * FROM users WHERE id = ${id}`;

// SAFE inside transactions too
await pg.begin(async (tx) => {
  const user = await tx`SELECT * FROM users WHERE id = ${id}`;
});
```

### `unsafe()` — manual parameterization required

The `unsafe()` method accepts raw SQL and an optional params array. The name is intentional: **you are responsible for parameterization**.

```typescript
// SAFE — value in params array, $1 placeholder in SQL
await pg.unsafe("SELECT * FROM users WHERE id = $1", [id]);

// DANGEROUS — value interpolated into SQL string
await pg.unsafe(`SELECT * FROM users WHERE id = ${id}`);
//                                                 ^^^ SQL injection risk
```

### Common patterns

**Dynamic `IN (...)` clauses** — build numbered placeholders, never `.join()` values into SQL:

```typescript
// SAFE
const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
const rows = await pg.unsafe(
  `SELECT * FROM files WHERE id IN (${placeholders})`,
  ids,
);

// DANGEROUS — ids.join() directly in SQL
await pg.unsafe(`SELECT * FROM files WHERE id IN (${ids.join(",")})`);
```

**Vector literals** — pass as a parameterized value with a cast, not as an interpolated string:

```typescript
// SAFE
await pg.unsafe(
  "INSERT INTO embeddings (vec) VALUES ($1::vector)",
  [`[${embedding.join(",")}]`],
);

// DANGEROUS — embedding data interpolated into SQL
await pg.unsafe(
  `INSERT INTO embeddings (vec) VALUES ('[${embedding.join(",")}]'::vector)`,
);
```

### SQLite

`SqliteDatabase.prepare()` returns a statement that accepts bind parameters positionally. Always use `?` placeholders:

```typescript
const db = getSqlite(config);

// SAFE — parameterized
db.prepare("SELECT * FROM users WHERE id = ?").get(id);

// DANGEROUS — interpolated
db.prepare(`SELECT * FROM users WHERE id = ${id}`).get();
```

### Rule of thumb

If a value comes from outside your function — user input, query parameters, API responses, even internal IDs — it goes in the **params array**, never in the SQL string. The only things that belong in string interpolation are static structural elements like column lists or table names that are hardcoded in your source.

## What you implement vs what the framework provides

### Framework provides

| Module | What it does |
|--------|-------------|
| **Database** | SQLite (with sqlite-vec) and PostgreSQL connection management. `StoreOps` factory for backend-agnostic query/run. Embedding serialization/deserialization. Parameterized migration runner. |
| **Search** | BM25 tokenizer + scorer + `buildBM25Context` helper. Generic hybrid scoring with named boost terms. Composable reranker interface. Query expansion with configurable abbreviation dictionaries. |
| **Eval** | Precision@k, HitRate@k, MRR, nDCG, Recall metric functions. Quality gate assertions for regression testing. |
| **Config** | `loadConfig<T>(appName, defaults)` — deep-merges defaults, global (`~/.config/{appName}/config.json`), and local (`.{appName}.json`). |
| **Logging** | Structured JSON logging with configurable domains, extensible correlation context, `hashPath` for PII-safe identifiers, and timing wrappers. |

### You implement

| Component | Example |
|-----------|---------|
| `Collector<TMeta>` | Fetch papers from crossref.org, scan files from disk, pull packages from a registry |
| `DocumentStore<TMeta>` | Your schema, your tables, your queries — the framework provides the connection and migration runner |
| Search function | Compose vector search + BM25 + framework scoring with your domain's boost signals |
| Config extension | `interface MyConfig extends EasierConfig { ... }` |

## Core types

```typescript
// A document to be indexed
interface Document<TMeta> {
  id: string;
  embeddingText: string;  // what gets embedded (descriptors)
  searchText: string;     // what BM25 matches against
  metadata: TMeta;
}

// A scored search result
interface SearchResult<TMeta> {
  id: string;
  cosineSimilarity: number;
  finalScore: number;
  metadata: TMeta;
  bm25Score?: number;
  explanation?: ScoreExplanation;
}

// Collector — discovers documents from an external source
interface Collector<TMeta> {
  collect(options?: { since?: Date }): AsyncIterable<Document<TMeta>>;
}

// DocumentStore — domain projects implement per their schema
interface DocumentStore<TMeta> {
  upsert(doc: Document<TMeta>, embedding: number[]): Promise<void>;
  upsertBatch(items: Array<{ doc: Document<TMeta>; embedding: number[] }>): Promise<void>;
  vectorSearch(queryEmbedding: number[], limit: number): Promise<Array<{ id: string; similarity: number; metadata: TMeta; searchText: string }>>;
  remove(ids: string[]): Promise<void>;
  count(): Promise<number>;
}
```

## Eval and quality gates

```typescript
import { precisionAtK, mrr, ndcg, evaluateGates, allGatesPassed } from "@easier-idx/core";

// Compute metrics
const p5 = precisionAtK(returnedIds, expectedIds, 5);
const mrrScore = mrr(returnedIds, expectedIds);

// Define quality gates as regression guards
const gates = [
  { metric: "precisionAtK" as const, threshold: 0.80, k: 5 },
  { metric: "mrr" as const, threshold: 0.70 },
];

const results = evaluateGates(summary, gates);
if (!allGatesPassed(results)) {
  console.error("Quality regression detected");
}
```

## Reranking

```typescript
import { applyRerankers, type Reranker } from "@easier-idx/core";

// Implement domain-specific rerankers
const citationReranker: Reranker<PaperMeta> = {
  name: "citations",
  async computeBoosts(results) {
    const boosts = new Map<string, number>();
    for (const r of results) {
      boosts.set(r.id, Math.log1p(r.metadata.citationCount) / 10);
    }
    return boosts;
  },
};

// Apply rerankers to results
const reranked = await applyRerankers(results, [citationReranker], {
  enabled: true,
  weights: { citations: 0.15 },
});
```

## Query expansion

```typescript
import { expandQuery, CODE_ABBREVIATIONS } from "@easier-idx/core";

// Code-centric (default)
expandQuery("getUserAuth");
// → "get User Auth getUserAuth authentication"

// Custom abbreviations for academic search
const ACADEMIC = { ML: "machine learning", NLP: "natural language processing" };
expandQuery("ML transformers", ACADEMIC);
// → "ML machine learning transformers"
```

## Subpath imports

Import specific modules to minimize bundle impact:

```typescript
import { computeHybridScore } from "@easier-idx/core/search";
import { getSqlite } from "@easier-idx/core/db/sqlite";
import { loadConfig } from "@easier-idx/core/config";
import { precisionAtK } from "@easier-idx/core/eval/metrics";
```

## Design principles

1. **Retrieval terminates at the match.** No generation step, no prompt construction, no grounded response.
2. **Index shape, not content.** Embed signatures, purposes, and attributes — not raw text.
3. **The consumer is programmatic.** Results are structured data for tools and agents, not prose for humans.
4. **Scoring is composable.** Cosine similarity + BM25 + named domain boosts. You define the boost signals.
5. **Domain projects own their schema.** The framework provides connections and migrations, not tables.

## License

Apache-2.0
