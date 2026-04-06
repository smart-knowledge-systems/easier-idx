import { createRequire } from "node:module";
import path from "path";
import { existsSync } from "fs";

// Use Homebrew SQLite on macOS if available (supports dynamic extensions)
const HOMEBREW_SQLITE = "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";
const require = createRequire(import.meta.url);

export interface SqliteRunResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

export interface SqliteStatement {
  all(
    ...params: (string | number | bigint | boolean | null | Uint8Array)[]
  ): unknown[];
  get(
    ...params: (string | number | bigint | boolean | null | Uint8Array)[]
  ): unknown;
  run(
    ...params: (string | number | bigint | boolean | null | Uint8Array)[]
  ): SqliteRunResult;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  transaction(fn: (...args: never[]) => unknown): (...args: never[]) => unknown;
  close(): void;
}

interface SqliteLoadable {
  loadExtension(file: string, entrypoint?: string): void;
}

const sqliteConnections = new Map<string, SqliteDatabase>();

export interface SqliteConfig {
  readonly path: string;
}

function isBunRuntime(): boolean {
  return typeof Bun !== "undefined";
}

function loadSqliteVec(db: SqliteDatabase): void {
  const sqliteVec = require("sqlite-vec") as {
    load: (db: SqliteLoadable) => void;
  };
  if ("loadExtension" in db && typeof db.loadExtension === "function") {
    try {
      sqliteVec.load(db as SqliteLoadable);
    } catch (err) {
      if (isBunRuntime()) throw err;
    }
  }
}

function createBunSqlite(dbPath: string): SqliteDatabase {
  const { Database } = require("bun:sqlite") as {
    Database: {
      new (path: string): SqliteDatabase;
      setCustomSQLite: (path: string) => void;
    };
  };

  if (process.platform === "darwin" && existsSync(HOMEBREW_SQLITE)) {
    try {
      Database.setCustomSQLite(HOMEBREW_SQLITE);
    } catch (err) {
      // Importing after SQLite is already initialized should not crash consumers.
      if (
        !(err instanceof Error) ||
        !err.message.includes("SQLite already loaded")
      ) {
        throw err;
      }
    }
  }

  return new Database(dbPath);
}

function createNodeSqlite(dbPath: string): SqliteDatabase {
  try {
    const BetterSqlite3 = require("better-sqlite3") as new (
      path: string,
    ) => SqliteDatabase;
    return new BetterSqlite3(dbPath);
  } catch (err) {
    throw new Error(
      "Node SQLite fallback requires the optional dependency `better-sqlite3` to be installed.",
      { cause: err },
    );
  }
}

/** Open (or return cached) SQLite connection with sqlite-vec loaded when available. */
export function getSqlite(
  config: SqliteConfig,
  baseDir?: string,
): SqliteDatabase {
  const dbPath =
    config.path === ":memory:"
      ? ":memory:"
      : path.isAbsolute(config.path)
        ? config.path
        : path.join(baseDir ?? process.cwd(), config.path);
  const cached = sqliteConnections.get(dbPath);
  if (cached) return cached;
  const db = isBunRuntime()
    ? createBunSqlite(dbPath)
    : createNodeSqlite(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  loadSqliteVec(db);
  sqliteConnections.set(dbPath, db);
  return db;
}

export function closeSqlite(): void {
  for (const db of sqliteConnections.values()) {
    db.close();
  }
  sqliteConnections.clear();
}
