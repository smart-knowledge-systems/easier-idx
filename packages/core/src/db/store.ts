// ---------------------------------------------------------------------------
// StoreOps factory — STEERING #2 (SQL is the API) + #6 (explicit over implicit)
// ---------------------------------------------------------------------------

import type { StoreOps } from "../types";
import type { PgClient, PgTx } from "./pg";
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
  const ops: StoreOps = {
    query: async <T>(sql: string, params?: unknown[]) =>
      db
        .prepare(pgToSqlite(sql))
        .all(...((params ?? []) as SqlBindings)) as T[],
    run: async (sql: string, params?: unknown[]) => {
      db.prepare(pgToSqlite(sql)).run(...((params ?? []) as SqlBindings));
    },
    // SQLite has a single connection, so `BEGIN`/`COMMIT` issued via
    // separate `run()` calls all hit the same db. Can't use the
    // built-in `db.transaction(fn)` helper because it's synchronous —
    // it would not await async work inside `fn`.
    transaction: async <T>(fn: (tx: StoreOps) => Promise<T>) => {
      db.exec("BEGIN");
      try {
        const txOps: StoreOps = {
          query: ops.query,
          run: ops.run,
          transaction: async () => {
            throw new Error(
              "StoreOps.transaction: nested transactions are not supported.",
            );
          },
        };
        const result = await fn(txOps);
        db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Ignore rollback errors — the original error is what matters.
        }
        throw err;
      }
    },
  };
  return ops;
}

/** Build a StoreOps that routes every call through a single `PgTx` handle. */
function createPgTxStoreOps(tx: PgTx): StoreOps {
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      (await tx.unsafe(sql, params as unknown[])) as T[],
    run: async (sql: string, params?: unknown[]) => {
      await tx.unsafe(sql, params as unknown[]);
    },
    transaction: async () => {
      throw new Error(
        "StoreOps.transaction: nested transactions are not supported — " +
          "the inner StoreOps already runs on a reserved connection.",
      );
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
    transaction: async <T>(fn: (tx: StoreOps) => Promise<T>) =>
      pg.begin(async (tx) => fn(createPgTxStoreOps(tx))),
  };
}

/**
 * Duck-typed interface for node-pg Pool / Client.
 * Any object with a `.query()` returning `{ rows }` satisfies this.
 *
 * `connect()` is optional: only required if `StoreOps.transaction` is
 * used. Real `pg.Pool` instances always provide it; mock pools used in
 * tests can omit it.
 */
export interface NodePgPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect?(): Promise<NodePgPoolClient>;
}

interface NodePgPoolClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
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
    transaction: async <T>(fn: (tx: StoreOps) => Promise<T>) => {
      if (!pool.connect) {
        throw new Error(
          "StoreOps.transaction: this node-pg pool does not expose connect() " +
            "— pass a real pg.Pool, not a duck-typed mock.",
        );
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txOps: StoreOps = {
          query: async <U>(sql: string, params?: unknown[]) => {
            const result = await client.query(sql, params);
            return result.rows as U[];
          },
          run: async (sql: string, params?: unknown[]) => {
            await client.query(sql, params);
          },
          transaction: async () => {
            throw new Error(
              "StoreOps.transaction: nested transactions are not supported.",
            );
          },
        };
        const result = await fn(txOps);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Ignore rollback errors — preserve the original.
        }
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
