// ---------------------------------------------------------------------------
// Postgres full-text search (FTS) helpers — tsvector/tsquery/GIN
// STEERING #2 (SQL is the API): fragment builders return SQL strings;
// consumers compose them into their own queries.
// Mirrors the pattern in db/vector.ts for pgvector helpers.
// ---------------------------------------------------------------------------

import type { PgClient, PgTx } from "./pg";
import { assertSafeIdentifier } from "./identifiers";
import { pgVectorLiteral } from "./vector";

// ---------------------------------------------------------------------------
// DDL helpers
// ---------------------------------------------------------------------------

export interface TsvectorWeight {
  /** Column name to include in the tsvector. */
  readonly column: string;
  /** FTS weight: A (highest) through D (lowest). */
  readonly weight: "A" | "B" | "C" | "D";
}

/**
 * Build a tsvector expression combining multiple columns with weights.
 * Returns a SQL expression suitable for a GENERATED ALWAYS AS column or trigger.
 *
 * @example
 * pgTsvectorExpression([
 *   { column: "subject", weight: "A" },
 *   { column: "body", weight: "B" },
 * ])
 * // → "setweight(to_tsvector('english', COALESCE(subject, '')), 'A') || setweight(to_tsvector('english', COALESCE(body, '')), 'B')"
 */
export function pgTsvectorExpression(
  weights: readonly TsvectorWeight[],
  config = "english",
): string {
  for (const w of weights) assertSafeIdentifier(w.column, "column");
  return weights
    .map(
      (w) =>
        `setweight(to_tsvector('${config}', COALESCE(${w.column}, '')), '${w.weight}')`,
    )
    .join(" || ");
}

/**
 * Build a `CREATE INDEX ... USING GIN` DDL statement for a tsvector column.
 */
export function pgFtsIndex(
  table: string,
  column: string,
  indexName?: string,
): string {
  assertSafeIdentifier(table, "table");
  assertSafeIdentifier(column, "column");
  const name = indexName ?? `idx_${table}_${column}_fts`;
  assertSafeIdentifier(name, "indexName");
  return `CREATE INDEX IF NOT EXISTS ${name} ON ${table} USING GIN(${column})`;
}

// ---------------------------------------------------------------------------
// Query fragment builders
// ---------------------------------------------------------------------------

/**
 * Return a WHERE clause fragment: `column @@ plainto_tsquery(config, $N)`.
 */
export function pgFtsWhere(
  tsvectorCol: string,
  queryParamIdx: number,
  config = "english",
): string {
  assertSafeIdentifier(tsvectorCol, "tsvectorCol");
  return `${tsvectorCol} @@ plainto_tsquery('${config}', $${queryParamIdx})`;
}

/**
 * Return a SELECT fragment: `ts_rank(column, plainto_tsquery(config, $N)) AS alias`.
 */
export function pgFtsRank(
  tsvectorCol: string,
  queryParamIdx: number,
  alias = "fts_rank",
  config = "english",
): string {
  assertSafeIdentifier(tsvectorCol, "tsvectorCol");
  assertSafeIdentifier(alias, "alias");
  return `ts_rank(${tsvectorCol}, plainto_tsquery('${config}', $${queryParamIdx})) AS ${alias}`;
}

/**
 * Return a `websearch_to_tsquery` WHERE fragment for more expressive queries
 * (supports quotes, OR, - for exclusion).
 */
export function pgWebsearchWhere(
  tsvectorCol: string,
  queryParamIdx: number,
  config = "english",
): string {
  assertSafeIdentifier(tsvectorCol, "tsvectorCol");
  return `${tsvectorCol} @@ websearch_to_tsquery('${config}', $${queryParamIdx})`;
}

// ---------------------------------------------------------------------------
// High-level hybrid executor (FTS + vector)
// ---------------------------------------------------------------------------

export interface PgHybridRankOpts {
  /** Table name to query. */
  table: string;
  /** Embedding column name (for vector similarity). */
  embeddingCol: string;
  /** Tsvector column name (for FTS ranking). */
  tsvectorCol: string;
  /** Query embedding vector. */
  embedding: number[];
  /** Text query for FTS. */
  query: string;
  /** Columns to select (default: `["id"]`). */
  select?: string[];
  /** Max results (default: no limit). */
  limit?: number;
  /** Weight of FTS in hybrid score: 0 = pure semantic, 1 = pure FTS (default: 0.3). */
  ftsWeight?: number;
  /** Minimum similarity threshold for vector results. */
  threshold?: number;
  /** Additional WHERE fragment (param indices start after the 2 used by embedding + query). */
  where?: string;
  /** Params for the additional WHERE fragment. */
  whereParams?: unknown[];
  /** FTS config (default: "english"). */
  ftsConfig?: string;
}

/**
 * Execute a hybrid vector + FTS query against PostgreSQL.
 * Combines cosine similarity and ts_rank into a weighted final score.
 *
 * Formula: `finalScore = (1 - ftsWeight) * similarity + ftsWeight * fts_rank_normalized`
 *
 * FTS rank is normalized by dividing by the max FTS rank in the result set.
 * Results are sorted by finalScore descending.
 */
export async function pgHybridRank(
  pg: PgClient | PgTx,
  opts: PgHybridRankOpts,
): Promise<
  Array<
    Record<string, unknown> & {
      similarity: number;
      fts_rank: number;
      final_score: number;
    }
  >
> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.embeddingCol, "embeddingCol");
  assertSafeIdentifier(opts.tsvectorCol, "tsvectorCol");
  const cols = opts.select ?? ["id"];
  for (const c of cols) assertSafeIdentifier(c, "select");
  const ftsWeight = opts.ftsWeight ?? 0.3;
  const ftsConfig = opts.ftsConfig ?? "english";
  const vecLit = pgVectorLiteral(opts.embedding);

  // $1 = embedding vector, $2 = text query
  const selectCols = [
    ...cols,
    `1 - (${opts.embeddingCol} <=> $1::vector) AS similarity`,
    `ts_rank(${opts.tsvectorCol}, plainto_tsquery('${ftsConfig}', $2)) AS fts_rank`,
  ].join(", ");

  let sql = `WITH scored AS (
  SELECT ${selectCols}
  FROM ${opts.table}
  WHERE ${opts.embeddingCol} IS NOT NULL
    AND ${opts.tsvectorCol} IS NOT NULL`;

  const params: unknown[] = [vecLit, opts.query];

  // FTS filter: only include rows matching the text query (if query is non-empty)
  sql += `
    AND (length(trim($2)) = 0 OR ${opts.tsvectorCol} @@ plainto_tsquery('${ftsConfig}', $2))`;

  if (opts.threshold != null) {
    sql += `
    AND 1 - (${opts.embeddingCol} <=> $1::vector) > ${opts.threshold}`;
  }

  if (opts.where) {
    sql += ` AND ${opts.where}`;
    if (opts.whereParams) params.push(...opts.whereParams);
  }

  // Compute hybrid score using window function for FTS normalization
  sql += `
)
SELECT *,
  (1.0 - ${ftsWeight}) * similarity + ${ftsWeight} * (fts_rank / GREATEST(MAX(fts_rank) OVER (), 1e-9)) AS final_score
FROM scored
ORDER BY final_score DESC`;

  if (opts.limit != null) {
    sql += ` LIMIT ${opts.limit}`;
  }

  return (await pg.unsafe(sql, params)) as Array<
    Record<string, unknown> & {
      similarity: number;
      fts_rank: number;
      final_score: number;
    }
  >;
}
