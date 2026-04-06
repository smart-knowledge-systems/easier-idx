import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { deepMerge, loadConfig, writeGlobalConfig } from "../src/config/config";

describe("deepMerge", () => {
  test("merges flat objects", () => {
    const base = { a: 1, b: 2 };
    const override = { b: 3, c: 4 };
    expect(deepMerge(base, override)).toEqual({ a: 1, b: 3, c: 4 });
  });

  test("deep merges nested objects", () => {
    const base = { scoring: { alpha: 0.1, beta: 0.2 } };
    const override = { scoring: { beta: 0.5 } };
    expect(deepMerge(base, override)).toEqual({
      scoring: { alpha: 0.1, beta: 0.5 },
    });
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

describe("config file IO", () => {
  test("loadConfig merges project-local config on top of defaults", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "easier-config-"));
    const appName = "easier-test";

    try {
      await writeFile(
        path.join(projectRoot, `.${appName}.json`),
        JSON.stringify({ scoring: { beta: 0.5 }, enabled: true }),
        "utf-8",
      );

      const config = await loadConfig(
        appName,
        { scoring: { alpha: 0.1, beta: 0.2 }, enabled: false },
        projectRoot,
      );

      expect(config).toEqual({
        scoring: { alpha: 0.1, beta: 0.5 },
        enabled: true,
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("writeGlobalConfig writes JSON with trailing newline", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "easier-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      const writtenPath = await writeGlobalConfig("easier-test", {
        enabled: true,
      });
      const content = await readFile(writtenPath, "utf-8");

      expect(content).toBe('{\n  "enabled": true\n}\n');
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
