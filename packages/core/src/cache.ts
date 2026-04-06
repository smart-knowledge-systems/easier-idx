// ---------------------------------------------------------------------------
// Cache-or-generate pattern + CAS guard + orphan detection
// STEERING #2 (SQL is the API) — callers provide SQL strings.
// STEERING #6 (explicit over implicit) — StoreOps passed as parameter.
// ---------------------------------------------------------------------------

import type { StoreOps } from "./types";
import { assertSafeIdentifier } from "./db/identifiers";

// ---------------------------------------------------------------------------
// Cache-or-generate ("ensure" pattern)
// ---------------------------------------------------------------------------

export interface EnsureOpts<T> {
  /** SQL to find existing cached data. */
  findSql: string;
  /** Params for findSql. */
  findParams: unknown[];
  /** Parse query rows into cached value, or null if not found. */
  parse: (rows: unknown[]) => T | null;
  /** Generate the value if not cached. */
  generate: () => Promise<{ data: T; meta?: Record<string, unknown> }>;
  /** SQL to save the generated value. */
  saveSql: string;
  /** Build params for saveSql from generated data + meta. */
  saveParams: (data: T, meta?: Record<string, unknown>) => unknown[];
}

export interface EnsureResult<T> {
  data: T;
  /** Whether generate() was called (false = cache hit). */
  generated: boolean;
  /** Metadata from generate(), if it was called. */
  meta?: Record<string, unknown>;
}

/**
 * Cache-or-generate: check the store for existing data, return it if found,
 * otherwise call generate(), save the result, and return it.
 */
export async function ensureCached<T>(
  ops: StoreOps,
  opts: EnsureOpts<T>,
): Promise<EnsureResult<T>> {
  const rows = await ops.query(opts.findSql, opts.findParams);
  const cached = opts.parse(rows);
  if (cached != null) {
    return { data: cached, generated: false };
  }

  const { data, meta } = await opts.generate();
  const params = opts.saveParams(data, meta);
  await ops.run(opts.saveSql, params);
  return { data, generated: true, meta };
}

// ---------------------------------------------------------------------------
// Compare-and-swap (CAS) guard
// ---------------------------------------------------------------------------

export interface CasUpdateOpts {
  table: string;
  idColumn: string;
  idValue: unknown;
  statusColumn: string;
  fromStatus: string;
  toStatus: string;
}

/**
 * Atomically update a status column only if it currently holds `fromStatus`.
 * Returns true if the row was updated (CAS succeeded), false otherwise.
 */
export async function casUpdate(
  ops: StoreOps,
  opts: CasUpdateOpts,
): Promise<boolean> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  assertSafeIdentifier(opts.statusColumn, "statusColumn");
  const sql = `UPDATE ${opts.table} SET ${opts.statusColumn} = $1 WHERE ${opts.idColumn} = $2 AND ${opts.statusColumn} = $3 RETURNING ${opts.idColumn}`;
  const rows = await ops.query(sql, [
    opts.toStatus,
    opts.idValue,
    opts.fromStatus,
  ]);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Orphan detection
// ---------------------------------------------------------------------------

export interface DetectOrphansOpts {
  table: string;
  idColumn: string;
  statusColumn: string;
  updatedAtColumn: string;
  /** Status values considered "stuck" (e.g. `["submitted", "processing"]`). */
  stuckStatuses: string[];
  /** Timeout in milliseconds. Rows older than this are considered orphans. */
  timeoutMs: number;
  /** Database backend — required for portable time expressions. */
  backend: "pg" | "sqlite";
}

/**
 * Find rows stuck in a given set of statuses for longer than `timeoutMs`.
 * Returns the id values of orphaned rows.
 */
export async function detectOrphans(
  ops: StoreOps,
  opts: DetectOrphansOpts,
): Promise<unknown[]> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  assertSafeIdentifier(opts.statusColumn, "statusColumn");
  assertSafeIdentifier(opts.updatedAtColumn, "updatedAtColumn");
  const placeholders = opts.stuckStatuses.map((_, i) => `$${i + 1}`).join(", ");
  const timeoutParam = `$${opts.stuckStatuses.length + 1}`;
  const timeFilter =
    opts.backend === "pg"
      ? `${opts.updatedAtColumn} < NOW() - (${timeoutParam} || ' milliseconds')::interval`
      : `${opts.updatedAtColumn} < datetime('now', '-' || (${timeoutParam} / 1000) || ' seconds')`;
  const sql = `SELECT ${opts.idColumn} FROM ${opts.table} WHERE ${opts.statusColumn} IN (${placeholders}) AND ${timeFilter}`;
  const rows = await ops.query<Record<string, unknown>>(sql, [
    ...opts.stuckStatuses,
    opts.timeoutMs,
  ]);
  return rows.map((r) => r[opts.idColumn]);
}

// ---------------------------------------------------------------------------
// Pipeline run logging — track batch embed/index/extract jobs
// ---------------------------------------------------------------------------

export interface PipelineRunStats {
  readonly processed?: number;
  readonly created?: number;
  readonly failed?: number;
  readonly durationMs?: number;
}

/**
 * Start a pipeline run. Inserts a row with status "running" and returns the run ID.
 * The caller's table must have: id (serial), run_type (text), status (text),
 * started_at (timestamptz), completed_at, duration_ms, records_processed,
 * records_created, records_failed, error_message.
 */
export async function startPipelineRun(
  ops: StoreOps,
  runType: string,
  table = "pipeline_runs",
): Promise<{ runId: number }> {
  assertSafeIdentifier(table, "table");
  const rows = await ops.query<{ id: number }>(
    `INSERT INTO ${table} (run_type, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id`,
    [runType],
  );
  return { runId: rows[0].id };
}

/**
 * Mark a pipeline run as completed with stats.
 */
export async function completePipelineRun(
  ops: StoreOps,
  runId: number,
  stats: PipelineRunStats,
  table = "pipeline_runs",
): Promise<void> {
  assertSafeIdentifier(table, "table");
  await ops.run(
    `UPDATE ${table} SET
       status = 'completed',
       completed_at = NOW(),
       duration_ms = $1,
       records_processed = $2,
       records_created = $3,
       records_failed = $4
     WHERE id = $5`,
    [
      stats.durationMs ?? null,
      stats.processed ?? 0,
      stats.created ?? 0,
      stats.failed ?? 0,
      runId,
    ],
  );
}

/**
 * Mark a pipeline run as failed with an error message.
 */
export async function failPipelineRun(
  ops: StoreOps,
  runId: number,
  errorMessage: string,
  table = "pipeline_runs",
): Promise<void> {
  assertSafeIdentifier(table, "table");
  await ops.run(
    `UPDATE ${table} SET status = 'failed', completed_at = NOW(), error_message = $1 WHERE id = $2`,
    [errorMessage, runId],
  );
}
