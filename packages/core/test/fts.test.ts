import { describe, expect, test } from "bun:test";
import {
  pgTsvectorExpression,
  pgFtsIndex,
  pgFtsWhere,
  pgFtsRank,
  pgWebsearchWhere,
} from "../src/db/fts";

describe("pgTsvectorExpression", () => {
  test("single column", () => {
    expect(pgTsvectorExpression([{ column: "title", weight: "A" }])).toBe(
      "setweight(to_tsvector('english', COALESCE(title, '')), 'A')",
    );
  });

  test("multiple weighted columns", () => {
    const result = pgTsvectorExpression([
      { column: "subject", weight: "A" },
      { column: "body", weight: "B" },
    ]);
    expect(result).toBe(
      "setweight(to_tsvector('english', COALESCE(subject, '')), 'A') || setweight(to_tsvector('english', COALESCE(body, '')), 'B')",
    );
  });

  test("custom config", () => {
    expect(
      pgTsvectorExpression([{ column: "content", weight: "A" }], "simple"),
    ).toContain("'simple'");
  });
});

describe("pgFtsIndex", () => {
  test("default index name", () => {
    expect(pgFtsIndex("emails", "fts")).toBe(
      "CREATE INDEX IF NOT EXISTS idx_emails_fts_fts ON emails USING GIN(fts)",
    );
  });

  test("custom index name", () => {
    expect(pgFtsIndex("emails", "fts", "my_idx")).toBe(
      "CREATE INDEX IF NOT EXISTS my_idx ON emails USING GIN(fts)",
    );
  });
});

describe("pgFtsWhere", () => {
  test("returns correct WHERE fragment", () => {
    expect(pgFtsWhere("fts", 1)).toBe("fts @@ plainto_tsquery('english', $1)");
  });

  test("custom param index", () => {
    expect(pgFtsWhere("search_vec", 3)).toBe(
      "search_vec @@ plainto_tsquery('english', $3)",
    );
  });
});

describe("pgFtsRank", () => {
  test("default alias", () => {
    expect(pgFtsRank("fts", 1)).toBe(
      "ts_rank(fts, plainto_tsquery('english', $1)) AS fts_rank",
    );
  });

  test("custom alias", () => {
    expect(pgFtsRank("fts", 2, "score")).toBe(
      "ts_rank(fts, plainto_tsquery('english', $2)) AS score",
    );
  });
});

describe("pgWebsearchWhere", () => {
  test("returns websearch fragment", () => {
    expect(pgWebsearchWhere("fts", 1)).toBe(
      "fts @@ websearch_to_tsquery('english', $1)",
    );
  });
});
