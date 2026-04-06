import { describe, it, expect } from "bun:test";
import { getSqlite } from "@easier-idx/core/db/sqlite";
import { createSqliteStoreOps } from "@easier-idx/core/db/store";
import { ensureTerms } from "../src/ensure";

describe("ensureTerms", () => {
  function setup() {
    const db = getSqlite({ path: ":memory:" });
    db.exec(
      "CREATE TABLE IF NOT EXISTS glossary (id INTEGER PRIMARY KEY, article_id INTEGER, keyword TEXT, definition TEXT)",
    );
    db.exec("DELETE FROM glossary");
    const ops = createSqliteStoreOps(db);
    return { db, ops };
  }

  it("first call generates, second call returns cached", async () => {
    const { ops } = setup();
    let generateCallCount = 0;

    const generate = async () => {
      generateCallCount++;
      return {
        terms: [
          { keyword: "API", definition: "Application Programming Interface" },
        ],
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
      };
    };

    const first = await ensureTerms(ops, {
      table: "glossary",
      idColumn: "article_id",
      idValue: 1,
      generate,
    });

    expect(first.generated).toBe(true);
    expect(first.terms).toHaveLength(1);
    expect(first.terms[0].keyword).toBe("API");
    expect(first.usage).toBeDefined();
    expect(generateCallCount).toBe(1);

    const second = await ensureTerms(ops, {
      table: "glossary",
      idColumn: "article_id",
      idValue: 1,
      generate,
    });

    expect(second.generated).toBe(false);
    expect(second.terms).toHaveLength(1);
    expect(second.terms[0].keyword).toBe("API");
    expect(second.usage).toBeUndefined();
    expect(generateCallCount).toBe(1);
  });
});
