import { describe, expect, test } from "bun:test";
import { hashPath } from "../src/logging/logging";

describe("hashPath", () => {
  test("returns 16-char hex string", () => {
    const result = hashPath("/Users/someone/repo/src/main.ts");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  test("deterministic — same input yields same output", () => {
    const a = hashPath("/foo/bar");
    const b = hashPath("/foo/bar");
    expect(a).toBe(b);
  });

  test("different paths yield different hashes", () => {
    const a = hashPath("/foo/bar");
    const b = hashPath("/foo/baz");
    expect(a).not.toBe(b);
  });
});
