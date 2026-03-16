import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createSqliteStoreOps } from "../src/db/store";
import { checkCostCap, getCostSummary } from "../src/cost/cost";
import type { StoreOps } from "../src/types";

function createTestOps(): { ops: StoreOps; db: Database } {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE cost_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL,
    tokens_out INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return { ops: createSqliteStoreOps(db), db };
}

function insertCostEvent(
  db: Database,
  operation: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  costUsd: number,
  minutesAgo = 0,
): void {
  db.prepare(
    `INSERT INTO cost_events (operation, model, tokens_in, tokens_out, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
  ).run(operation, model, tokensIn, tokensOut, costUsd, `-${minutesAgo} minutes`);
}

// ---------------------------------------------------------------------------
// checkCostCap
// ---------------------------------------------------------------------------

describe("checkCostCap", () => {
  test("not exceeded when no events", async () => {
    const { ops } = createTestOps();
    const result = await checkCostCap(ops, 1.0, "sqlite");
    expect(result.exceeded).toBe(false);
    expect(result.current).toBe(0);
    expect(result.limit).toBe(1.0);
  });

  test("not exceeded when under limit", async () => {
    const { ops, db } = createTestOps();
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 0.5, 10);
    const result = await checkCostCap(ops, 1.0, "sqlite");
    expect(result.exceeded).toBe(false);
    expect(result.current).toBe(0.5);
  });

  test("exceeded when at limit", async () => {
    const { ops, db } = createTestOps();
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 1.0, 5);
    const result = await checkCostCap(ops, 1.0, "sqlite");
    expect(result.exceeded).toBe(true);
    expect(result.current).toBe(1.0);
  });

  test("exceeded when over limit", async () => {
    const { ops, db } = createTestOps();
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 0.6, 5);
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 0.7, 10);
    const result = await checkCostCap(ops, 1.0, "sqlite");
    expect(result.exceeded).toBe(true);
    expect(result.current).toBeCloseTo(1.3);
  });

  test("ignores events older than 60 minutes", async () => {
    const { ops, db } = createTestOps();
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 5.0, 90);
    const result = await checkCostCap(ops, 1.0, "sqlite");
    expect(result.exceeded).toBe(false);
    expect(result.current).toBe(0);
  });

  test("null limit means never exceeded", async () => {
    const { ops, db } = createTestOps();
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 100, 5);
    const result = await checkCostCap(ops, null, "sqlite");
    expect(result.exceeded).toBe(false);
    expect(result.limit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCostSummary
// ---------------------------------------------------------------------------

describe("getCostSummary", () => {
  test("empty table returns empty array", async () => {
    const { ops } = createTestOps();
    const summary = await getCostSummary(ops);
    expect(summary).toHaveLength(0);
  });

  test("groups by operation and model", async () => {
    const { ops, db } = createTestOps();
    insertCostEvent(db, "embed", "text-embedding-3-small", 1000, 0, 0.1);
    insertCostEvent(db, "embed", "text-embedding-3-small", 2000, 0, 0.2);
    insertCostEvent(db, "summarize", "haiku", 500, 100, 0.5);

    const summary = await getCostSummary(ops);
    expect(summary).toHaveLength(2);

    // Ordered by cost desc — summarize/haiku first
    expect(summary[0].operation).toBe("summarize");
    expect(summary[0].model).toBe("haiku");
    expect(summary[0].eventCount).toBe(1);
    expect(summary[0].totalCostUsd).toBe(0.5);

    expect(summary[1].operation).toBe("embed");
    expect(summary[1].model).toBe("text-embedding-3-small");
    expect(summary[1].eventCount).toBe(2);
    expect(summary[1].totalTokensIn).toBe(3000);
    expect(summary[1].totalCostUsd).toBeCloseTo(0.3);
  });
});
