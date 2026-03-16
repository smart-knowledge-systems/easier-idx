# STEERING.md

Universal design principles for EASIER framework projects. Every module addition and API decision should be validated against these principles.

---

## 1. Retrieval is the terminal operation

No generation, no prompt stuffing. Results are pointers, not payloads. The consumer (human or agent) decides what to do next.

**Applies to:**
- Search results return IDs, scores, and metadata — not content
- No RAG pipeline, no response synthesis, no grounded generation
- Directory and collection results surface *existence*, not full content

---

## 2. SQL is the API

Typed convenience functions plus a raw `query`/`run` escape hatch. No ORMs, no GraphQL, no abstraction layers over the database. Agents excel at writing SQL — give them a schema and get out of the way.

**Applies to:**
- `StoreOps` exposes `query<T>` and `run` — nothing more
- Schema documentation in skill files, not locked behind an API surface
- `pgToSqlite` placeholder conversion is the only SQL rewriting the framework does

---

## 3. Progressive disclosure

Coarse to fine. IDs before content. Scores before explanations. The consumer decides how deep to go.

**Applies to:**
- Default search returns minimal result shapes
- Explanations, skeletons, and summaries are opt-in
- API surfaces start narrow and widen via optional parameters

---

## 4. Cost sensitivity drives architecture

Cheapest viable embedding model. Content-hash skip. Batch operations. Budget caps. Every architectural choice should respect that not everyone has unlimited API budgets.

**Applies to:**
- `checkCostCap` as a first-class framework function
- `getProjectedCost` for pre-flight estimates
- Content-hash deduplication to avoid re-embedding unchanged documents

---

## 5. Don't duplicate what's discoverable

The index stores descriptors for search, not as a replacement for the source. If the consumer can derive it from the original, don't cache it in the index.

**Applies to:**
- Skeletons are caches, not sources of truth — OK to invalidate aggressively
- Generated content (summaries) is worth preserving since regeneration costs money
- Skill descriptions should say "use the index to find *where*, then use tools to get *what*"

---

## 6. Explicit over implicit

Framework functions take their dependencies as parameters — config objects, database connections, options. No hidden singletons, no auto-loading, no magical ambient state. Domain projects own their lifecycle.

**Applies to:**
- `createSqliteStoreOps(db)` takes an open connection, not a config path
- `checkCostCap(ops, limit, backend)` takes explicit deps, not a global context
- `loadConfig(appName, defaults)` returns data — it doesn't store it globally
