import type { StoreOps } from "@easier-idx/core";
import { assertSafeIdentifier } from "@easier-idx/core";
import type { GlossaryTerm } from "./types";

export async function findTerms(
  ops: StoreOps,
  opts: { table: string; idColumn: string; idValue: unknown },
): Promise<GlossaryTerm[] | null> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  const rows = await ops.query<{ keyword: string; definition: string }>(
    `SELECT keyword, definition FROM ${opts.table} WHERE ${opts.idColumn} = $1`,
    [opts.idValue],
  );
  return rows.length > 0 ? rows : null;
}

export async function saveTerms(
  ops: StoreOps,
  opts: {
    table: string;
    idColumn: string;
    idValue: unknown;
    terms: GlossaryTerm[];
    extraColumns?: Record<string, unknown>;
  },
): Promise<void> {
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  if (opts.terms.length === 0) return;

  const extraKeys = opts.extraColumns ? Object.keys(opts.extraColumns) : [];
  for (const k of extraKeys) assertSafeIdentifier(k, "extraColumn");
  const extraValues = extraKeys.map((k) => opts.extraColumns![k]);
  const cols = [opts.idColumn, "keyword", "definition", ...extraKeys];
  const colsPerRow = cols.length;

  const allParams: unknown[] = [];
  const valuesClauses: string[] = [];

  for (const term of opts.terms) {
    const offset = allParams.length;
    const rowPlaceholders = cols.map((_, i) => `$${offset + i + 1}`);
    valuesClauses.push(`(${rowPlaceholders.join(", ")})`);
    allParams.push(opts.idValue, term.keyword, term.definition, ...extraValues);
  }

  await ops.run(
    `INSERT INTO ${opts.table} (${cols.join(", ")}) VALUES ${valuesClauses.join(", ")}`,
    allParams,
  );
}
