import { describe, it, expect } from "bun:test";
import { getSqlite } from "@easier/core/db/sqlite";
import { createSqliteStoreOps } from "@easier/core/db/store";
import { findDescription, saveDescription } from "../src/store";

describe("description store", () => {
  function setup() {
    const db = getSqlite({ path: ":memory:" });
    db.exec(
      "CREATE TABLE IF NOT EXISTS descriptions (id INTEGER PRIMARY KEY, article_id INTEGER, description TEXT)",
    );
    db.exec("DELETE FROM descriptions");
    const ops = createSqliteStoreOps(db);
    return { db, ops };
  }

  it("findDescription returns null when no rows exist", async () => {
    const { ops } = setup();
    const result = await findDescription(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 1,
    });
    expect(result).toBeNull();
  });

  it("saveDescription + findDescription roundtrip for strings", async () => {
    const { ops } = setup();

    await saveDescription(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 42,
      description: "A comprehensive overview of AI techniques.",
    });

    const found = await findDescription(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 42,
    });

    expect(found).toBe("A comprehensive overview of AI techniques.");
  });

  it("saveDescription + findDescription roundtrip with serialize/deserialize for JSON", async () => {
    const { ops } = setup();

    interface StructuredDesc {
      summary: string;
      tags: string[];
    }

    const data: StructuredDesc = {
      summary: "AI overview",
      tags: ["ai", "ml"],
    };

    await saveDescription<StructuredDesc>(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 99,
      description: data,
      serialize: (d) => JSON.stringify(d),
    });

    const found = await findDescription<StructuredDesc>(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 99,
      deserialize: (raw) => JSON.parse(raw),
    });

    expect(found).not.toBeNull();
    expect(found!.summary).toBe("AI overview");
    expect(found!.tags).toEqual(["ai", "ml"]);
  });
});
