import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import { existsSync } from "fs";

// Use Homebrew SQLite on macOS if available (supports dynamic extensions)
const HOMEBREW_SQLITE = "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";
if (process.platform === "darwin" && existsSync(HOMEBREW_SQLITE)) {
  Database.setCustomSQLite(HOMEBREW_SQLITE);
}

let _db: Database | null = null;

export interface SqliteConfig {
  readonly path: string;
}

/** Open (or return cached) SQLite connection with sqlite-vec loaded. */
export function getSqlite(config: SqliteConfig, baseDir?: string): Database {
  if (_db) return _db;
  const dbPath = path.isAbsolute(config.path)
    ? config.path
    : path.join(baseDir ?? process.cwd(), config.path);
  _db = new Database(dbPath);
  _db.exec("PRAGMA journal_mode=WAL");
  sqliteVec.load(_db);
  return _db;
}

export function closeSqlite(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
