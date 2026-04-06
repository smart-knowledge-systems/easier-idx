import { describe, it, expect } from "bun:test";
import { getSqlite } from "@easier-idx/core/db/sqlite";
import { createSqliteStoreOps } from "@easier-idx/core/db/store";
import { ensureDescription } from "../src/ensure";

describe("ensureDescription", () => {
  function setup() {
    const db = getSqlite({ path: ":memory:" });
    db.exec(
      "CREATE TABLE IF NOT EXISTS descriptions (id INTEGER PRIMARY KEY, article_id INTEGER, description TEXT)",
    );
    db.exec("DELETE FROM descriptions");
    const ops = createSqliteStoreOps(db);
    return { db, ops };
  }

  it("first call generates, second call returns cached", async () => {
    const { ops } = setup();
    let generateCallCount = 0;

    const generate = async () => {
      generateCallCount++;
      return {
        description: "An article about machine learning fundamentals.",
        usage: {
          inputTokens: 15,
          outputTokens: 25,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
      };
    };

    const first = await ensureDescription(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 1,
      generate,
    });

    expect(first.generated).toBe(true);
    expect(first.description).toBe(
      "An article about machine learning fundamentals.",
    );
    expect(first.usage).toBeDefined();
    expect(generateCallCount).toBe(1);

    const second = await ensureDescription(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 1,
      generate,
    });

    expect(second.generated).toBe(false);
    expect(second.description).toBe(
      "An article about machine learning fundamentals.",
    );
    expect(second.usage).toBeUndefined();
    expect(generateCallCount).toBe(1);
  });

  it("works with custom serialize/deserialize for JSON objects", async () => {
    const { ops } = setup();

    interface StructuredDesc {
      summary: string;
      confidence: number;
    }

    const generate = async () => ({
      description: {
        summary: "AI fundamentals",
        confidence: 0.95,
      } as StructuredDesc,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    });

    const first = await ensureDescription<StructuredDesc>(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 2,
      generate,
      serialize: (d) => JSON.stringify(d),
      deserialize: (raw) => JSON.parse(raw),
    });

    expect(first.generated).toBe(true);
    expect(first.description.summary).toBe("AI fundamentals");
    expect(first.description.confidence).toBe(0.95);

    const second = await ensureDescription<StructuredDesc>(ops, {
      table: "descriptions",
      idColumn: "article_id",
      idValue: 2,
      generate,
      serialize: (d) => JSON.stringify(d),
      deserialize: (raw) => JSON.parse(raw),
    });

    expect(second.generated).toBe(false);
    expect(second.description.summary).toBe("AI fundamentals");
    expect(second.description.confidence).toBe(0.95);
  });
});
