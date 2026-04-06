import type { StoreOps } from "@easier/core";
import type { TokenUsage } from "@easier/core/usage";
import type { GlossaryTerm, GenerateTermsResult } from "./types";
import { findTerms, saveTerms } from "./store";

export interface EnsureTermsOpts {
  table: string;
  idColumn: string;
  idValue: unknown;
  generate: () => Promise<GenerateTermsResult>;
  extraColumns?: Record<string, unknown>;
}

export interface EnsureTermsResult {
  terms: GlossaryTerm[];
  generated: boolean;
  usage?: TokenUsage;
}

export async function ensureTerms(
  ops: StoreOps,
  opts: EnsureTermsOpts,
): Promise<EnsureTermsResult> {
  const existing = await findTerms(ops, opts);
  if (existing) {
    return { terms: existing, generated: false };
  }

  const result = await opts.generate();
  await saveTerms(ops, {
    table: opts.table,
    idColumn: opts.idColumn,
    idValue: opts.idValue,
    terms: result.terms,
    extraColumns: opts.extraColumns,
  });

  return { terms: result.terms, generated: true, usage: result.usage };
}
