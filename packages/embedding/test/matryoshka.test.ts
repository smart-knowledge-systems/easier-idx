import { describe, expect, test } from "bun:test";
import { MatryoshkaProvider } from "../src/providers/matryoshka";
import type { EmbeddingProvider } from "../src/provider";

function mockProvider(dims: number, vectors?: number[][]): EmbeddingProvider {
  const defaultVec = Array.from({ length: dims }, (_, i) => (i + 1) / dims);
  return {
    name: "mock",
    dimensions: dims,
    async embed(texts: string[]) {
      return vectors ?? texts.map(() => [...defaultVec]);
    },
    async embedSingle() {
      return vectors?.[0] ?? [...defaultVec];
    },
  };
}

describe("MatryoshkaProvider", () => {
  test("truncates to target dimensions", async () => {
    const inner = mockProvider(8);
    const provider = new MatryoshkaProvider(inner, 4);

    expect(provider.dimensions).toBe(4);
    expect(provider.name).toBe("mock@4d");

    const result = await provider.embedSingle("test");
    expect(result).toHaveLength(4);
  });

  test("L2-renormalizes after truncation", async () => {
    const inner = mockProvider(8);
    const provider = new MatryoshkaProvider(inner, 4);

    const result = await provider.embedSingle("test");
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  test("batch embed truncates all vectors", async () => {
    const inner = mockProvider(8);
    const provider = new MatryoshkaProvider(inner, 4);

    const results = await provider.embed(["a", "b", "c"]);
    expect(results).toHaveLength(3);
    for (const vec of results) {
      expect(vec).toHaveLength(4);
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    }
  });

  test("throws if target exceeds inner dimensions", () => {
    const inner = mockProvider(4);
    expect(() => new MatryoshkaProvider(inner, 8)).toThrow("exceeds");
  });

  test("throws if target is zero or negative", () => {
    const inner = mockProvider(4);
    expect(() => new MatryoshkaProvider(inner, 0)).toThrow("positive");
    expect(() => new MatryoshkaProvider(inner, -1)).toThrow("positive");
  });

  test("no-op when target equals inner dimensions", async () => {
    const inner = mockProvider(4);
    const provider = new MatryoshkaProvider(inner, 4);

    const result = await provider.embedSingle("test");
    expect(result).toHaveLength(4);
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });
});
