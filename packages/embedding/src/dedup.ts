// ---------------------------------------------------------------------------
// Content-hash deduplication — STEERING #4 (cost sensitivity)
// Skip re-embedding when content hasn't changed.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { logEvent } from "@easier-idx/logging";
import { assertSafeIdentifier } from "@easier-idx/core";
import type { StoreOps } from "./cost";

/**
 * Compute a SHA-256 hash of normalized text.
 * Normalization: trim, collapse whitespace, lowercase.
 */
export function contentHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export interface ShouldEmbedOpts {
  /** Table containing the hash column. */
  readonly table: string;
  /** Primary key column name. */
  readonly idColumn: string;
  /** Column storing the content hash. */
  readonly hashColumn: string;
  /** Primary key value of the row to check. */
  readonly id: unknown;
  /** Hash of the current content. */
  readonly hash: string;
}

/**
 * Check if a document needs (re-)embedding by comparing content hashes.
 * Returns `true` if the row is new or its content has changed.
 */
export async function shouldEmbed(
  ops: StoreOps,
  opts: ShouldEmbedOpts,
): Promise<boolean> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  assertSafeIdentifier(opts.hashColumn, "hashColumn");
  const rows = await ops.query<Record<string, unknown>>(
    `SELECT ${opts.hashColumn} FROM ${opts.table} WHERE ${opts.idColumn} = $1 LIMIT 1`,
    [opts.id],
  );

  if (rows.length === 0) return true; // new row
  const existing = rows[0][opts.hashColumn] as string | null;
  const changed = existing !== opts.hash;

  if (!changed) {
    logEvent({
      event: "dedup.skip",
      id: String(opts.id),
      table: opts.table,
    });
  }

  return changed;
}

/**
 * Update the content hash after successful embedding.
 */
export async function markEmbedded(
  ops: StoreOps,
  opts: ShouldEmbedOpts,
): Promise<void> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  assertSafeIdentifier(opts.hashColumn, "hashColumn");
  await ops.run(
    `UPDATE ${opts.table} SET ${opts.hashColumn} = $1 WHERE ${opts.idColumn} = $2`,
    [opts.hash, opts.id],
  );
}
