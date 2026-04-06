// ---------------------------------------------------------------------------
// StoreOps factory — STEERING #2 (SQL is the API) + #6 (explicit over implicit)
// ---------------------------------------------------------------------------

import type { StoreOps } from "../types";
import type { PgClient } from "./pg";
import type { SqliteDatabase } from "./sqlite";

/** Convert pg-style `$1, $2, ...` placeholders to sqlite-style `?`. */
export function pgToSqlite(sql: string): string {
  const matches = [...sql.matchAll(/\$(\d+)/g)];
  if (matches.length > 0) {
    const nums = matches.map((m) => parseInt(m[1], 10));
    const max = Math.max(...nums);
    const seen = new Set(nums);
    for (let i = 1; i <= max; i++) {
      if (!seen.has(i))
        throw new Error(
          `pgToSqlite: non-sequential placeholder — $${i} missing`,
        );
    }
    // Check that placeholders appear in order (no $2 before $1)
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] < nums[i - 1]) {
        throw new Error(
          `pgToSqlite: out-of-order placeholders — $${nums[i]} appears after $${nums[i - 1]}`,
        );
      }
    }
  }
  return sql.replace(/\$\d+/g, "?");
}

type SqlBindings = (string | number | bigint | boolean | null | Uint8Array)[];

/** Create a StoreOps from an open SQLite database. */
export function createSqliteStoreOps(db: SqliteDatabase): StoreOps {
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

/** Create a StoreOps from an open PostgreSQL client. */
export function createPgStoreOps(pg: PgClient): StoreOps {
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      (await pg.unsafe(sql, params as unknown[])) as T[],
    run: async (sql: string, params?: unknown[]) => {
      await pg.unsafe(sql, params as unknown[]);
    },
  };
}

/**
 * Duck-typed interface for node-pg Pool / Client.
 * Any object with a `.query()` returning `{ rows }` satisfies this.
 */
export interface NodePgPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Create a StoreOps from a node-pg Pool or Client.
 * Accepts any object matching the `NodePgPool` shape — no import of `pg` needed.
 */
export function createNodePgStoreOps(pool: NodePgPool): StoreOps {
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    run: async (sql: string, params?: unknown[]) => {
      await pool.query(sql, params);
    },
  };
}
