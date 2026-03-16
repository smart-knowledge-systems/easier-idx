import { AsyncLocalStorage } from "node:async_hooks";
import type { SqlRunner } from "../types";
import { logEvent } from "../logging/logging";

// ---------------------------------------------------------------------------
// Pricing constants (USD per 1M tokens)
// ---------------------------------------------------------------------------

export const PRICING: Record<string, { input: number; output?: number }> = {
  "text-embedding-3-small": { input: 0.02 },
  "text-embedding-3-large": { input: 0.13 },
  "nomic-embed-text": { input: 0 },
  haiku: { input: 1.0, output: 5.0 },
};

/** Register additional model pricing at runtime. */
export function registerPricing(
  model: string,
  pricing: { input: number; output?: number },
): void {
  PRICING[model] = pricing;
}

// ---------------------------------------------------------------------------
// Async-scoped context
// ---------------------------------------------------------------------------

interface CostContext {
  sqlRunner: SqlRunner | null;
}

const costStorage = new AsyncLocalStorage<CostContext>();

/**
 * Run `fn` with a scoped cost context. All `recordCost` calls within `fn`
 * will use this context's SqlRunner to persist cost events.
 */
export function withCostContext<T>(
  sqlRunner: SqlRunner,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return costStorage.run({ sqlRunner }, fn);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function computeCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING[model] ?? null;
  if (!pricing) return 0;
  const inputCost = (tokensIn * pricing.input) / 1_000_000;
  const outputCost = pricing.output != null ? (tokensOut * pricing.output) / 1_000_000 : 0;
  return inputCost + outputCost;
}

// ---------------------------------------------------------------------------
// Record a cost event
// ---------------------------------------------------------------------------

export async function recordCost(
  operation: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  const ctx = costStorage.getStore();
  if (!ctx?.sqlRunner) {
    logEvent({
      event: "cost.record.skipped",
      reason: "no_context",
      operation,
      model,
    });
    return;
  }

  const costUsd = computeCostUsd(model, tokensIn, tokensOut);

  await ctx.sqlRunner.run(
    `INSERT INTO cost_events (operation, model, tokens_in, tokens_out, cost_usd)
     VALUES ($1, $2, $3, $4, $5)`,
    [operation, model, tokensIn, tokensOut, costUsd],
  );
}

// ---------------------------------------------------------------------------
// Projected cost estimation
// ---------------------------------------------------------------------------

export function getProjectedCost(
  documentCount: number,
  avgTokensPerDoc: number,
  embeddingModel = "text-embedding-3-small",
): { embeddingCost: number; totalCost: number } {
  const embeddingTokens = documentCount * avgTokensPerDoc;
  const modelPricing = PRICING[embeddingModel] ?? PRICING["text-embedding-3-small"];
  const embeddingCost = (embeddingTokens * modelPricing.input) / 1_000_000;
  return { embeddingCost, totalCost: embeddingCost };
}
