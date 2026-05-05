import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  pgToSqlite,
  createSqliteStoreOps,
  createNodePgStoreOps,
} from "../src/db/store";

// ---------------------------------------------------------------------------
// pgToSqlite placeholder conversion
// ---------------------------------------------------------------------------

describe("pgToSqlite", () => {
  test("converts $1 placeholders to ?", () => {
    expect(pgToSqlite("SELECT * FROM t WHERE a = $1 AND b = $2")).toBe(
      "SELECT * FROM t WHERE a = ? AND b = ?",
    );
  });

  test("handles no placeholders", () => {
    expect(pgToSqlite("SELECT 1")).toBe("SELECT 1");
  });

  test("handles double-digit placeholders", () => {
    const placeholders = Array.from({ length: 12 }, (_, i) => `$${i + 1}`).join(
      ", ",
    );
    const expected = Array.from({ length: 12 }, () => "?").join(", ");
    expect(pgToSqlite(placeholders)).toBe(expected);
  });

  test("throws on non-sequential placeholders", () => {
    expect(() => pgToSqlite("$2, $3")).toThrow("non-sequential");
  });

  test("throws on out-of-order placeholders", () => {
    expect(() => pgToSqlite("$2, $1")).toThrow("out-of-order");
  });

  test("preserves non-placeholder dollar signs (e.g. $$)", () => {
    // $$ is used in PG for dollar-quoting, but $\d+ is the placeholder pattern
    expect(pgToSqlite("$$ body $$")).toBe("$$ body $$");
  });
});

// ---------------------------------------------------------------------------
// createSqliteStoreOps
// ---------------------------------------------------------------------------

describe("createSqliteStoreOps", () => {
  test("query returns rows", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO items (name) VALUES ('alpha')");
    db.run("INSERT INTO items (name) VALUES ('beta')");

    const ops = createSqliteStoreOps(db);
    const rows = await ops.query<{ id: number; name: string }>(
      "SELECT * FROM items ORDER BY id",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("alpha");
    expect(rows[1].name).toBe("beta");
    db.close();
  });

  test("query with pg-style params", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO items (name) VALUES ('alpha')");
    db.run("INSERT INTO items (name) VALUES ('beta')");

    const ops = createSqliteStoreOps(db);
    const rows = await ops.query<{ id: number; name: string }>(
      "SELECT * FROM items WHERE name = $1",
      ["beta"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("beta");
    db.close();
  });

  test("run executes statements", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");

    const ops = createSqliteStoreOps(db);
    await ops.run("INSERT INTO items (name) VALUES ($1)", ["gamma"]);

    const rows = db.prepare("SELECT name FROM items").all() as Array<{
      name: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("gamma");
    db.close();
  });

  test("run with no params", async () => {
    const db = new Database(":memory:");
    const ops = createSqliteStoreOps(db);
    await ops.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");

    // Should not throw — table exists
    const rows = db.prepare("SELECT * FROM t").all();
    expect(rows).toHaveLength(0);
    db.close();
  });

  test("transaction commits on success", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    const ops = createSqliteStoreOps(db);

    await ops.transaction(async (tx) => {
      await tx.run("INSERT INTO items (name) VALUES ($1)", ["alpha"]);
      await tx.run("INSERT INTO items (name) VALUES ($1)", ["beta"]);
    });

    const rows = db
      .prepare("SELECT name FROM items ORDER BY id")
      .all() as Array<{
      name: string;
    }>;
    expect(rows).toEqual([{ name: "alpha" }, { name: "beta" }]);
    db.close();
  });

  test("transaction rolls back on throw", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    const ops = createSqliteStoreOps(db);

    await expect(
      ops.transaction(async (tx) => {
        await tx.run("INSERT INTO items (name) VALUES ($1)", ["alpha"]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rows = db.prepare("SELECT name FROM items").all();
    expect(rows).toHaveLength(0);
    db.close();
  });

  test("transaction returns fn's value", async () => {
    const db = new Database(":memory:");
    const ops = createSqliteStoreOps(db);
    const result = await ops.transaction(async () => 42);
    expect(result).toBe(42);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// createNodePgStoreOps — duck-typed node-pg adapter
// ---------------------------------------------------------------------------

describe("createNodePgStoreOps", () => {
  test("query delegates to pool.query and returns rows", async () => {
    const mockPool = {
      query: async (_sql: string, _params?: unknown[]) => ({
        rows: [
          { id: 1, name: "alpha" },
          { id: 2, name: "beta" },
        ],
      }),
    };

    const ops = createNodePgStoreOps(mockPool);
    const rows = await ops.query<{ id: number; name: string }>(
      "SELECT * FROM items",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("alpha");
  });

  test("query passes params through", async () => {
    let capturedParams: unknown[] | undefined;
    const mockPool = {
      query: async (_sql: string, params?: unknown[]) => {
        capturedParams = params;
        return { rows: [{ id: 1 }] };
      },
    };

    const ops = createNodePgStoreOps(mockPool);
    await ops.query("SELECT * FROM items WHERE id = $1", [42]);
    expect(capturedParams).toEqual([42]);
  });

  test("run delegates to pool.query", async () => {
    let called = false;
    const mockPool = {
      query: async () => {
        called = true;
        return { rows: [] };
      },
    };

    const ops = createNodePgStoreOps(mockPool);
    await ops.run("INSERT INTO items (name) VALUES ($1)", ["gamma"]);
    expect(called).toBe(true);
  });

  test("transaction issues BEGIN/COMMIT on a checked-out client", async () => {
    const calls: string[] = [];
    const released: { count: number } = { count: 0 };
    const mockClient = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      },
      release: () => {
        released.count++;
      },
    };
    const mockPool = {
      query: async () => ({ rows: [] }),
      connect: async () => mockClient,
    };

    const ops = createNodePgStoreOps(mockPool);
    await ops.transaction(async (tx) => {
      await tx.run("INSERT INTO items VALUES (1)");
    });

    expect(calls).toEqual(["BEGIN", "INSERT INTO items VALUES (1)", "COMMIT"]);
    expect(released.count).toBe(1);
  });

  test("transaction rolls back on throw and releases client", async () => {
    const calls: string[] = [];
    const released: { count: number } = { count: 0 };
    const mockClient = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      },
      release: () => {
        released.count++;
      },
    };
    const mockPool = {
      query: async () => ({ rows: [] }),
      connect: async () => mockClient,
    };

    const ops = createNodePgStoreOps(mockPool);
    await expect(
      ops.transaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(released.count).toBe(1);
  });

  test("transaction throws when pool lacks connect()", async () => {
    const mockPool = {
      query: async () => ({ rows: [] }),
    };

    const ops = createNodePgStoreOps(mockPool);
    await expect(ops.transaction(async () => undefined)).rejects.toThrow(
      "does not expose connect()",
    );
  });
});
