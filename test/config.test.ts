import { describe, expect, test } from "bun:test";
import { deepMerge } from "../src/config/config";

describe("deepMerge", () => {
  test("merges flat objects", () => {
    const base = { a: 1, b: 2 };
    const override = { b: 3, c: 4 };
    expect(deepMerge(base, override)).toEqual({ a: 1, b: 3, c: 4 });
  });

  test("deep merges nested objects", () => {
    const base = { scoring: { alpha: 0.1, beta: 0.2 } };
    const override = { scoring: { beta: 0.5 } };
    expect(deepMerge(base, override)).toEqual({ scoring: { alpha: 0.1, beta: 0.5 } });
  });

  test("does not merge arrays (replaces them)", () => {
    const base = { tags: [1, 2] };
    const override = { tags: [3] };
    expect(deepMerge(base, override)).toEqual({ tags: [3] });
  });

  test("ignores undefined values", () => {
    const base = { a: 1 };
    const override = { a: undefined };
    expect(deepMerge(base, override)).toEqual({ a: 1 });
  });

  test("handles empty override", () => {
    const base = { a: 1, b: { c: 2 } };
    expect(deepMerge(base, {})).toEqual({ a: 1, b: { c: 2 } });
  });
});
