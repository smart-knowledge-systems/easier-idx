import { describe, it, expect } from "bun:test";
import { getSqlite } from "@easier/core/db/sqlite";
import { createSqliteStoreOps } from "@easier/core/db/store";
import { findTerms, saveTerms } from "../src/store";

describe("glossary store", () => {
  function setup() {
    const db = getSqlite({ path: ":memory:" });
    db.exec(
      "CREATE TABLE IF NOT EXISTS glossary (id INTEGER PRIMARY KEY, article_id INTEGER, keyword TEXT, definition TEXT)",
    );
    db.exec("DELETE FROM glossary");
    const ops = createSqliteStoreOps(db);
    return { db, ops };
  }

  it("findTerms returns null when no rows exist", async () => {
    const { ops } = setup();
    const result = await findTerms(ops, {
      table: "glossary",
      idColumn: "article_id",
      idValue: 1,
    });
    expect(result).toBeNull();
  });

  it("saveTerms + findTerms roundtrip", async () => {
    const { ops } = setup();
    const terms = [
      { keyword: "AI", definition: "Artificial Intelligence" },
      { keyword: "ML", definition: "Machine Learning" },
    ];

    await saveTerms(ops, {
      table: "glossary",
      idColumn: "article_id",
      idValue: 42,
      terms,
    });

    const found = await findTerms(ops, {
      table: "glossary",
      idColumn: "article_id",
      idValue: 42,
    });

    expect(found).not.toBeNull();
    expect(found).toHaveLength(2);
    expect(found![0].keyword).toBe("AI");
    expect(found![0].definition).toBe("Artificial Intelligence");
    expect(found![1].keyword).toBe("ML");
    expect(found![1].definition).toBe("Machine Learning");
  });
});
