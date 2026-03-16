import { describe, expect, test } from "bun:test";
import { applyRerankers } from "../src/search/rerank";
import type { Reranker, RerankConfig } from "../src/search/rerank";
import type { SearchResult } from "../src/types";

function makeResult(id: string, finalScore: number): SearchResult {
  return {
    id,
    cosineSimilarity: finalScore,
    bm25Score: 0,
    finalScore,
    metadata: {},
  };
}

describe("applyRerankers", () => {
  test("returns copy when disabled", async () => {
    const results = [makeResult("a", 0.9), makeResult("b", 0.8)];
    const config: RerankConfig = { enabled: false, weights: {} };
    const out = await applyRerankers(results, [], config);
    expect(out).toEqual(results);
    expect(out).not.toBe(results); // new array
  });

  test("returns copy with no rerankers", async () => {
    const results = [makeResult("a", 0.9)];
    const config: RerankConfig = { enabled: true, weights: {} };
    const out = await applyRerankers(results, [], config);
    expect(out).toEqual(results);
  });

  test("applies single reranker boost", async () => {
    const results = [makeResult("a", 0.5), makeResult("b", 0.8)];
    const reranker: Reranker = {
      name: "test",
      async computeBoosts() {
        return new Map([
          ["a", 0.5], // boost "a" to 1.0
          ["b", 0.0],
        ]);
      },
    };
    const config: RerankConfig = { enabled: true, weights: { test: 1 } };
    const out = await applyRerankers(results, [reranker], config);
    expect(out[0].id).toBe("a"); // "a" should now be first
    expect(out[0].finalScore).toBe(1.0);
    expect(out[1].id).toBe("b");
    expect(out[1].finalScore).toBe(0.8);
  });

  test("applies weighted rerankers", async () => {
    const results = [makeResult("a", 0.5), makeResult("b", 0.5)];
    const r1: Reranker = {
      name: "r1",
      async computeBoosts() {
        return new Map([["a", 1.0]]);
      },
    };
    const r2: Reranker = {
      name: "r2",
      async computeBoosts() {
        return new Map([["b", 1.0]]);
      },
    };
    const config: RerankConfig = {
      enabled: true,
      weights: { r1: 0.5, r2: 0.3 },
    };
    const out = await applyRerankers(results, [r1, r2], config);
    expect(out[0].id).toBe("a"); // 0.5 + 0.5*1.0 = 1.0
    expect(out[0].finalScore).toBe(1.0);
    expect(out[1].id).toBe("b"); // 0.5 + 0.3*1.0 = 0.8
    expect(out[1].finalScore).toBe(0.8);
  });

  test("missing weight defaults to 1", async () => {
    const results = [makeResult("a", 0.5)];
    const reranker: Reranker = {
      name: "unnamed",
      async computeBoosts() {
        return new Map([["a", 0.2]]);
      },
    };
    const config: RerankConfig = { enabled: true, weights: {} }; // no weight for "unnamed"
    const out = await applyRerankers(results, [reranker], config);
    expect(out[0].finalScore).toBe(0.7); // 0.5 + 1*0.2
  });
});
