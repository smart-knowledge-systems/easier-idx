// ---------------------------------------------------------------------------
// StoreOps factory — STEERING #2 (SQL is the API) + #6 (explicit over implicit)
// ---------------------------------------------------------------------------

import type { Database } from "bun:sqlite";
import type { SQL } from "bun";
import type { StoreOps } from "../types";

/** Convert pg-style `$1, $2, ...` placeholders to sqlite-style `?`. */
export function pgToSqlite(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

type SqlBindings = (string | number | bigint | boolean | null | Uint8Array)[];

/** Create a StoreOps from an open SQLite database. */
export function createSqliteStoreOps(db: Database): StoreOps {
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      db
        .prepare(pgToSqlite(sql))
        .all(...((params ?? []) as SqlBindings)) as T[],
    run: async (sql: string, params?: unknown[]) => {
      db.prepare(pgToSqlite(sql)).run(...((params ?? []) as SqlBindings));
    },
  };
}

/** Create a StoreOps from an open Bun SQL (PostgreSQL) instance. */
export function createPgStoreOps(pg: InstanceType<typeof SQL>): StoreOps {
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      (await pg.unsafe(sql, params as unknown[])) as T[],
    run: async (sql: string, params?: unknown[]) => {
      await pg.unsafe(sql, params as unknown[]);
    },
  };
}
