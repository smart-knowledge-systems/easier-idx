import { describe, expect, test } from "bun:test";
import { buildBM25Context } from "../src/search/bm25-helpers";

describe("buildBM25Context", () => {
  const docs = [
    { id: "a", text: "database query optimization" },
    { id: "b", text: "user authentication login" },
    { id: "c", text: "database migration schema" },
  ];

  test("returns scores for matching docs", () => {
    const ctx = buildBM25Context(docs, "database");
    expect(ctx.scores.size).toBeGreaterThan(0);
    expect(ctx.scores.has("a")).toBe(true);
    expect(ctx.scores.has("c")).toBe(true);
  });

  test("non-matching docs have no score", () => {
    const ctx = buildBM25Context(docs, "database");
    expect(ctx.scores.has("b")).toBe(false);
  });

  test("maxScore is the maximum of all scores", () => {
    const ctx = buildBM25Context(docs, "database");
    const max = Math.max(...ctx.scores.values());
    expect(ctx.maxScore).toBe(max);
  });

  test("empty docs returns maxScore 1", () => {
    const ctx = buildBM25Context([], "anything");
    expect(ctx.scores.size).toBe(0);
    expect(ctx.maxScore).toBe(1);
  });

  test("query with no matches returns empty scores with maxScore 1", () => {
    const ctx = buildBM25Context(docs, "zzzznonexistent");
    expect(ctx.scores.size).toBe(0);
    expect(ctx.maxScore).toBe(1);
  });

  test("multi-term query scores docs with more matches higher", () => {
    const ctx = buildBM25Context(docs, "database query");
    // doc "a" has both "database" and "query", should score higher than "c"
    const scoreA = ctx.scores.get("a") ?? 0;
    const scoreC = ctx.scores.get("c") ?? 0;
    expect(scoreA).toBeGreaterThan(scoreC);
  });
});
