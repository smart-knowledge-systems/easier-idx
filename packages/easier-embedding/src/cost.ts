import { AsyncLocalStorage } from "node:async_hooks";

let logEvent: (entry: Record<string, unknown>) => void = () => {};
try {
  const logging = await import("@easier/core/logging");
  logEvent = logging.logEvent;
} catch {
  // @easier/core is an optional peer
}

// ---------------------------------------------------------------------------
// StoreOps — inline minimal interface to avoid hard dependency on @easier/core
// ---------------------------------------------------------------------------

/** Store-agnostic database operations (mirrors @easier/core StoreOps). */
export interface StoreOps {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  run: (sql: string, params?: unknown[]) => Promise<void>;
}

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
  ops: StoreOps | null;
}

const costStorage = new AsyncLocalStorage<CostContext>();

/**
 * Run `fn` with a scoped cost context. All `recordCost` calls within `fn`
 * will use this context's StoreOps to persist cost events.
 */
export function withCostContext<T>(
  ops: StoreOps,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return costStorage.run({ ops }, fn);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function computeCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const pricing = PRICING[model] ?? null;
  if (!pricing) return 0;
  const inputCost = (tokensIn * pricing.input) / 1_000_000;
  const outputCost =
    pricing.output != null ? (tokensOut * pricing.output) / 1_000_000 : 0;
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
  if (!ctx?.ops) {
    logEvent({
      event: "cost.record.skipped",
      reason: "no_context",
      operation,
      model,
    });
    return;
  }

  const costUsd = computeCostUsd(model, tokensIn, tokensOut);

  await ctx.ops.run(
    `INSERT INTO cost_events (operation, model, tokens_in, tokens_out, cost_usd)
     VALUES ($1, $2, $3, $4, $5)`,
    [operation, model, tokensIn, tokensOut, costUsd],
  );
}

// ---------------------------------------------------------------------------
// Cost cap check
// ---------------------------------------------------------------------------

/** Time-window SQL fragment per backend. */
const TIME_WINDOW_SQL = {
  pg: "created_at >= now() - interval '60 minutes'",
  sqlite: "created_at >= datetime('now', '-60 minutes')",
} as const;

/** Check if cost in the last hour exceeds the configured cap. */
export async function checkCostCap(
  ops: StoreOps,
  limit: number | null,
  backend: "pg" | "sqlite",
): Promise<{ exceeded: boolean; current: number; limit: number | null }> {
  const timeFilter = TIME_WINDOW_SQL[backend];
  const rows = await ops.query<{ total: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_events WHERE ${timeFilter}`,
  );
  const current = Number(rows[0]?.total ?? 0);

  return {
    exceeded: limit != null && current >= limit,
    current,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Cost summary
// ---------------------------------------------------------------------------

export interface CostSummaryRow {
  operation: string;
  model: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  eventCount: number;
}

/** Normalize a raw cost-summary row into a CostSummaryRow. */
function normalizeCostRow(r: Record<string, unknown>): CostSummaryRow {
  return {
    operation: r.operation as string,
    model: r.model as string,
    totalTokensIn: Number(r.total_tokens_in),
    totalTokensOut: Number(r.total_tokens_out),
    totalCostUsd: Number(r.total_cost_usd),
    eventCount: Number(r.event_count),
  };
}

/** Get cost summary grouped by operation and model. */
export async function getCostSummary(ops: StoreOps): Promise<CostSummaryRow[]> {
  const rows = await ops.query<Record<string, unknown>>(
    `SELECT operation, model,
            SUM(tokens_in) AS total_tokens_in,
            SUM(tokens_out) AS total_tokens_out,
            SUM(cost_usd) AS total_cost_usd,
            COUNT(*) AS event_count
     FROM cost_events
     GROUP BY operation, model
     ORDER BY total_cost_usd DESC`,
  );
  return rows.map(normalizeCostRow);
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
  const modelPricing =
    PRICING[embeddingModel] ?? PRICING["text-embedding-3-small"];
  const embeddingCost = (embeddingTokens * modelPricing.input) / 1_000_000;
  return { embeddingCost, totalCost: embeddingCost };
}
