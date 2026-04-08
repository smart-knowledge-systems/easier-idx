import { createHash } from "crypto";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { logEvent } from "@easier-idx/logging";
import type { PgClient, PgTx } from "./pg";
import type { SqliteDatabase } from "./sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationFile {
  version: number;
  filename: string;
  sql: string;
}

export type MigrationResult =
  | { tag: "ok"; versions: number[] }
  | { tag: "err"; error: Error };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseSqlStatements(sql: string): string[] {
  const results: string[] = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inString) {
      inString = true;
      current += ch;
    } else if (ch === "'" && inString) {
      current += ch;
      if (i + 1 < sql.length && sql[i + 1] === "'") {
        current += "'";
        i++; // skip escaped quote
      } else {
        inString = false;
      }
    } else if (ch === ";" && !inString) {
      const trimmed = current.trim();
      if (trimmed.length > 0) results.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) results.push(trimmed);

  return results;
}

function stripCommentLines(statements: string[]): string[] {
  return statements
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

function stripInlineComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inString) {
      inString = true;
    } else if (ch === "'" && inString) {
      if (i + 1 < line.length && line[i + 1] === "'") {
        i++;
      } else {
        inString = false;
      }
    } else if (
      !inString &&
      ch === "-" &&
      i + 1 < line.length &&
      line[i + 1] === "-"
    ) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function splitPgStatements(sql: string): string[] {
  const results: string[] = [];
  let current = "";
  let dollarTag: string | null = null;

  const lines = sql.split("\n");
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!dollarTag && trimmed.startsWith("--")) continue;

    const effectiveLine = !dollarTag ? stripInlineComment(line) : line;
    current += (current ? "\n" : "") + effectiveLine;

    const dollarRe = /\$([A-Za-z_]*)\$/g;
    let m: RegExpExecArray | null;
    while ((m = dollarRe.exec(line)) !== null) {
      const tag = m[0];
      if (dollarTag === null) {
        dollarTag = tag;
      } else if (dollarTag === tag) {
        dollarTag = null;
      }
    }
    const inDollarQuote = dollarTag !== null;
    if (!inDollarQuote && effectiveLine.trimEnd().endsWith(";")) {
      const stmt = current.replace(/;$/, "").trim();
      if (stmt.length > 0) results.push(stmt);
      current = "";
    }
  }

  const remaining = current.trim();
  if (remaining.length > 0) results.push(remaining);

  return results;
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

async function loadMigrationFiles(
  migrationsDir: string,
  backend: "pg" | "sqlite",
): Promise<MigrationFile[]> {
  const suffix = `.${backend}.sql`;
  let entries: string[];
  try {
    entries = await readdir(migrationsDir);
  } catch {
    return [];
  }

  const migrations: MigrationFile[] = [];
  for (const filename of entries) {
    if (!filename.endsWith(suffix)) continue;
    const versionStr = filename.split("_")[0];
    const version = parseInt(versionStr, 10);
    if (isNaN(version)) continue;

    const sql = await readFile(path.join(migrationsDir, filename), "utf-8");
    migrations.push({ version, filename, sql });
  }

  return migrations.sort((a, b) => a.version - b.version);
}

// ---------------------------------------------------------------------------
// PostgreSQL migrations
// ---------------------------------------------------------------------------

async function getPgVersion(pg: PgClient): Promise<number> {
  try {
    const rows = await pg.unsafe(
      "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
    );
    return rows.length > 0 ? (rows[0].version as number) : 0;
  } catch {
    return 0;
  }
}

async function applyPgMigrations(
  pg: PgClient,
  migrationsDir: string,
): Promise<MigrationResult> {
  const currentVersion = await getPgVersion(pg);
  const migrations = await loadMigrationFiles(migrationsDir, "pg");
  const applied: number[] = [];

  for (const m of migrations) {
    if (m.version <= currentVersion) continue;

    try {
      await pg.begin(async (tx: PgTx) => {
        const statements = splitPgStatements(m.sql);
        for (const stmt of statements) {
          await tx.unsafe(stmt);
        }
        await tx.unsafe(
          "INSERT INTO schema_version (version, checksum, filename) VALUES ($1, $2, $3)",
          [m.version, sha256(m.sql), m.filename],
        );
      });
      applied.push(m.version);
      logEvent({ event: "infra.migrate.apply", version: m.version, backend: "pg" });
    } catch (err) {
      return {
        tag: "err",
        error: new Error(`Migration ${m.version} failed: ${err}`, {
          cause: err,
        }),
      };
    }
  }

  return { tag: "ok", versions: applied };
}

// ---------------------------------------------------------------------------
// SQLite migrations
// ---------------------------------------------------------------------------

function getSqliteVersion(db: SqliteDatabase): number {
  const rows = db.prepare("PRAGMA user_version").all() as {
    user_version: number;
  }[];
  return rows[0]?.user_version ?? 0;
}

async function applySqliteMigrationsAsync(
  db: SqliteDatabase,
  migrationsDir: string,
): Promise<MigrationResult> {
  const currentVersion = getSqliteVersion(db);
  const migrations = await loadMigrationFiles(migrationsDir, "sqlite");
  const applied: number[] = [];

  for (const m of migrations) {
    if (m.version <= currentVersion) continue;

    const statements = stripCommentLines(parseSqlStatements(m.sql));

    const runMigration = db.transaction(() => {
      for (const stmt of statements) {
        db.exec(stmt);
      }
      db.exec(`PRAGMA user_version = ${m.version}`);
    });

    try {
      runMigration();
      applied.push(m.version);
      logEvent({
        event: "infra.migrate.apply",
        version: m.version,
        backend: "sqlite",
      });
    } catch (err) {
      return {
        tag: "err",
        error: new Error(`Migration ${m.version} failed: ${err}`, {
          cause: err,
        }),
      };
    }
  }

  return { tag: "ok", versions: applied };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function applyMigrations(
  backend: "pg" | "sqlite",
  migrationsDir: string,
  db: SqliteDatabase | PgClient,
): Promise<MigrationResult> {
  if (backend === "pg") {
    return applyPgMigrations(db as PgClient, migrationsDir);
  }
  return applySqliteMigrationsAsync(db as SqliteDatabase, migrationsDir);
}

export async function getCurrentSchemaVersion(
  backend: "pg" | "sqlite",
  db: SqliteDatabase | PgClient,
): Promise<number> {
  if (backend === "pg") {
    return getPgVersion(db as PgClient);
  }
  return getSqliteVersion(db as SqliteDatabase);
}

export async function getLatestMigrationVersion(
  migrationsDir: string,
  backend: "pg" | "sqlite",
): Promise<number> {
  const migrations = await loadMigrationFiles(migrationsDir, backend);
  return migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
}

// Re-export for domain projects that need vec0 table creation
export { sha256 as migrationChecksum };
