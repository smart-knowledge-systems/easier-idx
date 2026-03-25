import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { closePg, getPg } from "../src/db/pg";
import { closeSqlite, getSqlite } from "../src/db/sqlite";

afterEach(async () => {
  closeSqlite();
  await closePg();
});

describe("runtime caches", () => {
  test("getSqlite caches by resolved path", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "easier-sqlite-"));

    try {
      const a = getSqlite({ path: "a.db" }, tempDir);
      const aAgain = getSqlite({ path: "a.db" }, tempDir);
      const b = getSqlite({ path: "b.db" }, tempDir);

      expect(aAgain).toBe(a);
      expect(b).not.toBe(a);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("getPg caches by connection config", () => {
    const a = getPg(
      { host: "localhost", port: 5432, database: "db_a", user: "app" },
      10,
    );
    const aAgain = getPg(
      { host: "localhost", port: 5432, database: "db_a", user: "app" },
      10,
    );
    const b = getPg(
      { host: "localhost", port: 5432, database: "db_b", user: "app" },
      10,
    );

    expect(aAgain).toBe(a);
    expect(b).not.toBe(a);
  });
});
