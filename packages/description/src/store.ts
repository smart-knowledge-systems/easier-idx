import type { StoreOps } from "@easier-idx/core";
import { assertSafeIdentifier } from "@easier-idx/core";

export async function findDescription<T = string>(
  ops: StoreOps,
  opts: {
    table: string;
    idColumn: string;
    idValue: unknown;
    descriptionColumn?: string;
    deserialize?: (raw: string) => T;
  },
): Promise<T | null> {
  const col = opts.descriptionColumn ?? "description";
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  assertSafeIdentifier(col, "descriptionColumn");
  const rows = await ops.query<Record<string, unknown>>(
    `SELECT ${col} FROM ${opts.table} WHERE ${opts.idColumn} = $1 LIMIT 1`,
    [opts.idValue],
  );
  if (rows.length === 0) return null;
  const raw = rows[0][col] as string;
  if (raw == null) return null;
  return opts.deserialize ? opts.deserialize(raw) : (raw as unknown as T);
}

export async function saveDescription<T = string>(
  ops: StoreOps,
  opts: {
    table: string;
    idColumn: string;
    idValue: unknown;
    description: T;
    descriptionColumn?: string;
    serialize?: (data: T) => string;
    extraColumns?: Record<string, unknown>;
  },
): Promise<void> {
  const col = opts.descriptionColumn ?? "description";
  assertSafeIdentifier(opts.table, "table");
  assertSafeIdentifier(opts.idColumn, "idColumn");
  assertSafeIdentifier(col, "descriptionColumn");
  const serialized = opts.serialize
    ? opts.serialize(opts.description)
    : (opts.description as unknown as string);

  const extraKeys = opts.extraColumns ? Object.keys(opts.extraColumns) : [];
  for (const k of extraKeys) assertSafeIdentifier(k, "extraColumn");
  const extraPlaceholders = extraKeys.map((_, i) => `$${i + 3}`);
  const extraValues = extraKeys.map((k) => opts.extraColumns![k]);

  const cols = [opts.idColumn, col, ...extraKeys];
  const placeholders = ["$1", "$2", ...extraPlaceholders];

  await ops.run(
    `INSERT INTO ${opts.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    [opts.idValue, serialized, ...extraValues],
  );
}
