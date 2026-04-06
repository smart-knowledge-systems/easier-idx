import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { applyMigrations, getCurrentSchemaVersion } from "../src/db/migrate";
import type { PgClient, PgTx } from "../src/db/pg";

describe("PostgreSQL migrations", () => {
  test("migration version 1 is recorded and not re-applied", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "easier-migrate-"));
    const migrationsDir = path.join(tempDir, "migrations");
    await mkdir(migrationsDir, { recursive: true });
    await Bun.write(
      path.join(migrationsDir, "001_init.pg.sql"),
      "CREATE TABLE schema_version (version INTEGER, checksum TEXT, filename TEXT);\nCREATE TABLE items (id INTEGER);",
    );

    const insertedVersions: number[] = [];
    let createItemsCount = 0;

    const client = {
      unsafe: async <T>(sql: string, params?: unknown[]) => {
        if (sql.startsWith("SELECT version FROM schema_version")) {
          return (
            insertedVersions.length > 0
              ? [{ version: insertedVersions[insertedVersions.length - 1] }]
              : []
          ) as T[];
        }
        if (sql.startsWith("INSERT INTO schema_version")) {
          insertedVersions.push(params?.[0] as number);
          return [] as T[];
        }
        if (sql.startsWith("CREATE TABLE items")) {
          createItemsCount += 1;
          if (createItemsCount > 1) {
            throw new Error("items already exists");
          }
        }
        return [] as T[];
      },
      begin: async <T>(fn: (tx: PgTx) => Promise<T>) => fn(client as PgClient),
      close: async () => {},
    } as unknown as PgClient;

    try {
      const first = await applyMigrations("pg", migrationsDir, client);
      const second = await applyMigrations("pg", migrationsDir, client);
      const version = await getCurrentSchemaVersion("pg", client);

      expect(first).toEqual({ tag: "ok", versions: [1] });
      expect(second).toEqual({ tag: "ok", versions: [] });
      expect(version).toBe(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
