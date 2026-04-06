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
  for (const term of opts.terms) {
    const extraKeys = opts.extraColumns ? Object.keys(opts.extraColumns) : [];
    const extraPlaceholders = extraKeys.map((_, i) => `$${i + 4}`);
    const extraValues = extraKeys.map((k) => opts.extraColumns![k]);

    const cols = [opts.idColumn, "keyword", "definition", ...extraKeys];
    const placeholders = ["$1", "$2", "$3", ...extraPlaceholders];

    await ops.run(
      `INSERT INTO ${opts.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
      [opts.idValue, term.keyword, term.definition, ...extraValues],
    );
  }
}
