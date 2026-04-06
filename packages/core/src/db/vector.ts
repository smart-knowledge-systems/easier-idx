// ---------------------------------------------------------------------------
// Server-side vector query support — pgvector (PostgreSQL) + sqlite-vec (SQLite)
// STEERING #2 (SQL is the API): fragment builders return SQL strings;
// consumers compose them into their own queries.
// ---------------------------------------------------------------------------

import type { PgClient, PgTx } from "./pg";
import type { SqliteDatabase } from "./sqlite";
import { serializeEmbedding } from "./util";

// ---------------------------------------------------------------------------
// PostgreSQL DDL helpers
// ---------------------------------------------------------------------------

/** Execute `CREATE EXTENSION IF NOT EXISTS vector` on a PostgreSQL connection. */
export async function pgvectorInit(pg: PgClient | PgTx): Promise<void> {
  await pg.unsafe("CREATE EXTENSION IF NOT EXISTS vector");
}

/** Return a `vector(N)` column type fragment for use in CREATE TABLE DDL. */
export function pgvectorColumn(dims: number): string {
  return `vector(${dims})`;
}

/** Build a `CREATE INDEX ... USING hnsw` DDL statement. */
export function pgvectorHnswIndex(
  table: string,
  column: string,
  opts?: {
    indexName?: string;
    m?: number;
    efConstruction?: number;
    opclass?: string;
  },
): string {
  const name = opts?.indexName ?? `idx_${table}_${column}_hnsw`;
  const m = opts?.m ?? 16;
  const ef = opts?.efConstruction ?? 64;
  const opclass = opts?.opclass ?? "vector_cosine_ops";
  return `CREATE INDEX IF NOT EXISTS ${name} ON ${table} USING hnsw (${column} ${opclass}) WITH (m = ${m}, ef_construction = ${ef})`;
}

/** Execute `SET LOCAL hnsw.ef_search = N` (transaction-scoped). */
export async function pgSetHnswEfSearch(
  pg: PgClient | PgTx,
  value: number,
): Promise<void> {
  await pg.unsafe(`SET LOCAL hnsw.ef_search = ${Math.round(value)}`);
}

// ---------------------------------------------------------------------------
// PostgreSQL query fragment builders
// ---------------------------------------------------------------------------

/** Format a number[] embedding as a pgvector literal string `[0.1,0.2,...]`. */
export function pgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Return a `$N::vector` cast fragment. */
export function pgVectorCast(paramIndex: number): string {
  return `$${paramIndex}::vector`;
}

/**
 * Return a cosine similarity expression: `1 - (column <=> $N::vector)`.
 * Optionally alias the result (default: `similarity`).
 */
export function pgCosineSimilarity(
  column: string,
  paramIndex: number,
  alias = "similarity",
): string {
  return `1 - (${column} <=> $${paramIndex}::vector) AS ${alias}`;
}

/** Return a cosine distance expression: `column <=> $N::vector`. */
export function pgCosineDistance(column: string, paramIndex: number): string {
  return `${column} <=> $${paramIndex}::vector`;
}

/**
 * Return a conditional similarity expression that handles NULL embedding columns:
 * `CASE WHEN col IS NOT NULL THEN 1 - (col <=> $N::vector) ELSE 0 END`.
 */
export function pgConditionalSimilarity(
  column: string,
  paramIndex: number,
  alias = "similarity",
): string {
  return `CASE WHEN ${column} IS NOT NULL THEN 1 - (${column} <=> $${paramIndex}::vector) ELSE 0 END AS ${alias}`;
}

// ---------------------------------------------------------------------------
// SQLite DDL helpers
// ---------------------------------------------------------------------------

/**
 * Build a `CREATE VIRTUAL TABLE ... USING vec0(...)` DDL statement.
 * @param name   Table name (e.g. `"file_embeddings"`)
 * @param pkCol  Primary key column name (e.g. `"file_id"`)
 * @param dims   Embedding dimensions (e.g. `1536`)
 * @param opts   Optional: embedding column name (default `"embedding"`)
 */
export function vec0CreateTable(
  name: string,
  pkCol: string,
  dims: number,
  opts?: { embeddingCol?: string },
): string {
  const embCol = opts?.embeddingCol ?? "embedding";
  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${name} USING vec0(${pkCol} integer PRIMARY KEY, ${embCol} float[${dims}])`;
}

// ---------------------------------------------------------------------------
// SQLite query fragment builders
// ---------------------------------------------------------------------------

/**
 * Return the WHERE clause fragment for a sqlite-vec KNN query:
 * `embedding MATCH ? AND k = ?`.
 * The caller binds: (1) serialized embedding buffer, (2) k limit.
 */
export function sqliteKnnWhere(embeddingCol = "embedding"): string {
  return `${embeddingCol} MATCH ? AND k = ?`;
}

/**
 * Return a `vec_distance_cosine(column, ?)` expression for point-to-point distance.
 * The caller binds the serialized embedding buffer.
 */
export function sqlitePointDistance(
  column = "embedding",
  alias = "distance",
): string {
  return `vec_distance_cosine(${column}, ?) AS ${alias}`;
}

// ---------------------------------------------------------------------------
// High-level executors
// ---------------------------------------------------------------------------

export interface PgRankByVectorOpts {
  /** Table name to query. */
  table: string;
  /** Embedding column name. */
  column: string;
  /** Query embedding. */
  embedding: number[];
  /** Columns to select (default: `["id"]`). */
  select?: string[];
  /** Max results (default: no limit). */
  limit?: number;
  /** Minimum similarity threshold (results below are excluded). */
  threshold?: number;
  /** Additional WHERE fragment (e.g. `"repo_id = ANY($2::int[])"`) — param indices start at 2. */
  where?: string;
  /** Params for the additional WHERE fragment. */
  whereParams?: unknown[];
}

/**
 * Execute a ranked vector similarity query against PostgreSQL.
 * Returns rows sorted by descending similarity.
 */
export async function pgRankByVector(
  pg: PgClient | PgTx,
  opts: PgRankByVectorOpts,
): Promise<Array<Record<string, unknown> & { similarity: number }>> {
  const cols = opts.select ?? ["id"];
  const vecLit = pgVectorLiteral(opts.embedding);
  const selectClause = [
    ...cols,
    `1 - (${opts.column} <=> $1::vector) AS similarity`,
  ].join(", ");

  let sql = `SELECT ${selectClause} FROM ${opts.table} WHERE ${opts.column} IS NOT NULL`;
  const params: unknown[] = [vecLit];

  if (opts.where) {
    sql += ` AND ${opts.where}`;
    if (opts.whereParams) params.push(...opts.whereParams);
  }

  if (opts.threshold != null) {
    sql += ` AND 1 - (${opts.column} <=> $1::vector) > ${opts.threshold}`;
  }

  sql += ` ORDER BY ${opts.column} <=> $1::vector`;

  if (opts.limit != null) {
    sql += ` LIMIT ${opts.limit}`;
  }

  return (await pg.unsafe(sql, params)) as Array<
    Record<string, unknown> & { similarity: number }
  >;
}

export interface SqliteRankByVectorOpts {
  /** vec0 virtual table name (e.g. `"file_embeddings"`). */
  vecTable: string;
  /** Main table to JOIN against. */
  joinTable: string;
  /** Column in vec0 table that joins to joinTable (e.g. `"file_id"`). */
  joinCol: string;
  /** Query embedding. */
  embedding: number[];
  /** KNN limit (k parameter). */
  k: number;
  /** Columns to select from joinTable (default: `["id"]`). */
  select?: string[];
  /** Embedding column name in vec0 table (default: `"embedding"`). */
  embeddingCol?: string;
}

/**
 * Execute a KNN vector search against SQLite using sqlite-vec.
 * Returns rows sorted by ascending distance (closest first).
 */
export function sqliteRankByVector(
  db: SqliteDatabase,
  opts: SqliteRankByVectorOpts,
): Array<Record<string, unknown> & { distance: number }> {
  const embCol = opts.embeddingCol ?? "embedding";
  const cols = opts.select ?? ["id"];
  const selectCols = cols.map((c) => `t.${c}`).join(", ");
  const embBuf = serializeEmbedding(opts.embedding);

  const sql = `SELECT ${selectCols}, v.distance
    FROM ${opts.vecTable} v
    JOIN ${opts.joinTable} t ON t.id = v.${opts.joinCol}
    WHERE v.${embCol} MATCH ? AND v.k = ?`;

  return db.prepare(sql).all(embBuf, opts.k) as Array<
    Record<string, unknown> & { distance: number }
  >;
}
