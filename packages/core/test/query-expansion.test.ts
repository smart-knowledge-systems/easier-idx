import { describe, expect, test } from "bun:test";
import { expandQuery, CODE_ABBREVIATIONS } from "../src/search/query-expansion";

describe("expandQuery", () => {
  test("decomposes camelCase", () => {
    const result = expandQuery("getUserName");
    expect(result).toContain("get");
    expect(result).toContain("User");
    expect(result).toContain("Name");
    expect(result).toContain("getUserName");
  });

  test("expands abbreviations", () => {
    const result = expandQuery("auth db");
    expect(result).toContain("auth");
    expect(result).toContain("authentication");
    expect(result).toContain("db");
    expect(result).toContain("database");
  });

  test("deduplicates terms", () => {
    const result = expandQuery("auth auth");
    const tokens = result.split(" ");
    const authCount = tokens.filter((t) => t.toLowerCase() === "auth").length;
    expect(authCount).toBe(1);
  });

  test("passes through unknown terms", () => {
    expect(expandQuery("foobar")).toBe("foobar");
  });

  test("handles multi-word abbreviation expansion", () => {
    const result = expandQuery("cfg");
    expect(result).toContain("cfg");
    expect(result).toContain("config");
    expect(result).toContain("configuration");
  });

  test("custom abbreviation dictionary", () => {
    const custom = { svc: "service" };
    const result = expandQuery("svc", custom);
    expect(result).toContain("svc");
    expect(result).toContain("service");
    // Should NOT expand "auth" with custom dict
    expect(expandQuery("auth", custom)).toBe("auth");
  });

  test("handles empty query", () => {
    expect(expandQuery("")).toBe("");
  });

  test("CODE_ABBREVIATIONS has expected entries", () => {
    expect(CODE_ABBREVIATIONS["db"]).toBe("database");
    expect(CODE_ABBREVIATIONS["repo"]).toBe("repository");
  });
});
