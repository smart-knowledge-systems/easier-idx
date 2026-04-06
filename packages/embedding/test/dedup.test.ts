import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { contentHash, shouldEmbed, markEmbedded } from "../src/dedup";
import type { StoreOps } from "../src/cost";

/** Create a StoreOps from an in-memory SQLite database (test helper). */
function sqliteOps(db: Database): StoreOps {
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      db
        .prepare(sql.replace(/\$\d+/g, "?"))
        .all(
          ...((params ?? []) as (
            | string
            | number
            | bigint
            | boolean
            | null
            | Uint8Array
          )[]),
        ) as T[],
    run: async (sql: string, params?: unknown[]) => {
      db.prepare(sql.replace(/\$\d+/g, "?")).run(
        ...((params ?? []) as (
          | string
          | number
          | bigint
          | boolean
          | null
          | Uint8Array
        )[]),
      );
    },
  };
}

function setupDb() {
  const db = new Database(":memory:");
  db.run(
    "CREATE TABLE docs (id INTEGER PRIMARY KEY, content TEXT, content_hash TEXT)",
  );
  db.run("INSERT INTO docs (id, content) VALUES (1, 'hello world')");
  db.run(
    "INSERT INTO docs (id, content, content_hash) VALUES (2, 'existing', 'abc123')",
  );
  return { db, ops: sqliteOps(db) };
}

describe("contentHash", () => {
  test("returns consistent hash for same content", () => {
    const h1 = contentHash("hello world");
    const h2 = contentHash("hello world");
    expect(h1).toBe(h2);
  });

  test("normalizes whitespace", () => {
    const h1 = contentHash("hello  world");
    const h2 = contentHash("hello world");
    expect(h1).toBe(h2);
  });

  test("normalizes case", () => {
    const h1 = contentHash("Hello World");
    const h2 = contentHash("hello world");
    expect(h1).toBe(h2);
  });

  test("trims whitespace", () => {
    const h1 = contentHash("  hello world  ");
    const h2 = contentHash("hello world");
    expect(h1).toBe(h2);
  });

  test("different content gives different hash", () => {
    const h1 = contentHash("hello");
    const h2 = contentHash("world");
    expect(h1).not.toBe(h2);
  });
});

describe("shouldEmbed", () => {
  test("returns true for row with no hash", async () => {
    const { ops, db } = setupDb();
    const result = await shouldEmbed(ops, {
      table: "docs",
      idColumn: "id",
      hashColumn: "content_hash",
      id: 1,
      hash: contentHash("hello world"),
    });
    expect(result).toBe(true);
    db.close();
  });

  test("returns true for row with different hash", async () => {
    const { ops, db } = setupDb();
    const result = await shouldEmbed(ops, {
      table: "docs",
      idColumn: "id",
      hashColumn: "content_hash",
      id: 2,
      hash: contentHash("changed content"),
    });
    expect(result).toBe(true);
    db.close();
  });

  test("returns false for row with matching hash", async () => {
    const { ops, db } = setupDb();
    const result = await shouldEmbed(ops, {
      table: "docs",
      idColumn: "id",
      hashColumn: "content_hash",
      id: 2,
      hash: "abc123",
    });
    expect(result).toBe(false);
    db.close();
  });

  test("returns true for non-existent row", async () => {
    const { ops, db } = setupDb();
    const result = await shouldEmbed(ops, {
      table: "docs",
      idColumn: "id",
      hashColumn: "content_hash",
      id: 999,
      hash: "anything",
    });
    expect(result).toBe(true);
    db.close();
  });
});

describe("markEmbedded", () => {
  test("updates hash column", async () => {
    const { ops, db } = setupDb();
    await markEmbedded(ops, {
      table: "docs",
      idColumn: "id",
      hashColumn: "content_hash",
      id: 1,
      hash: "newhash",
    });
    const rows = db
      .prepare("SELECT content_hash FROM docs WHERE id = 1")
      .all() as { content_hash: string }[];
    expect(rows[0].content_hash).toBe("newhash");
    db.close();
  });
});
