import type { StoreOps } from "@easier-idx/core";
import type { TokenUsage } from "@easier-idx/core/usage";
import type { GenerateDescriptionResult } from "./types";
import { findDescription, saveDescription } from "./store";

export interface EnsureDescriptionOpts<T = string> {
  table: string;
  idColumn: string;
  idValue: unknown;
  descriptionColumn?: string;
  generate: () => Promise<GenerateDescriptionResult<T>>;
  serialize?: (data: T) => string;
  deserialize?: (raw: string) => T;
  extraColumns?: Record<string, unknown>;
}

export interface EnsureDescriptionResult<T = string> {
  description: T;
  generated: boolean;
  usage?: TokenUsage;
}

export async function ensureDescription<T = string>(
  ops: StoreOps,
  opts: EnsureDescriptionOpts<T>,
): Promise<EnsureDescriptionResult<T>> {
  const existing = await findDescription<T>(ops, {
    table: opts.table,
    idColumn: opts.idColumn,
    idValue: opts.idValue,
    descriptionColumn: opts.descriptionColumn,
    deserialize: opts.deserialize,
  });
  if (existing != null) {
    return { description: existing, generated: false };
  }

  const result = await opts.generate();
  await saveDescription<T>(ops, {
    table: opts.table,
    idColumn: opts.idColumn,
    idValue: opts.idValue,
    description: result.description,
    descriptionColumn: opts.descriptionColumn,
    serialize: opts.serialize,
    extraColumns: opts.extraColumns,
  });

  return {
    description: result.description,
    generated: true,
    usage: result.usage,
  };
}
