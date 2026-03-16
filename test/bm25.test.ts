import { describe, expect, test } from "bun:test";
import { tokenize, buildIndex, score } from "../src/search/bm25";

describe("tokenize", () => {
  test("splits on non-alphanumeric", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
  });

  test("splits camelCase", () => {
    expect(tokenize("camelCaseWord")).toEqual(["camel", "case", "word"]);
  });

  test("removes stopwords", () => {
    expect(tokenize("the quick and slow")).toEqual(["quick", "slow"]);
  });

  test("lowercases", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  test("filters short words", () => {
    expect(tokenize("a b cd ef")).toEqual(["cd", "ef"]);
  });
});

describe("buildIndex + score", () => {
  const docs = [
    { id: "1", text: "transformer architecture for protein folding" },
    { id: "2", text: "recurrent neural network language model" },
    { id: "3", text: "protein structure prediction using attention" },
  ];

  test("scores relevant docs higher", () => {
    const index = buildIndex(docs);
    const scores = score(index, "protein folding");
    expect(scores.get("1")).toBeGreaterThan(0);
    expect(scores.get("3")).toBeGreaterThan(0);
    expect(scores.has("2")).toBe(false);
  });

  test("returns empty map for no-match query", () => {
    const index = buildIndex(docs);
    const scores = score(index, "quantum computing");
    expect(scores.size).toBe(0);
  });

  test("handles empty corpus", () => {
    const index = buildIndex([]);
    const scores = score(index, "anything");
    expect(scores.size).toBe(0);
  });
});
