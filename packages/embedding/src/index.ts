// ---------------------------------------------------------------------------
// @easier/embedding — barrel export
// ---------------------------------------------------------------------------

// Provider interface — consumers implement this
export type { EmbeddingProvider } from "./provider";

// Embedder — requires a provider from the consumer
export { embed, embedSingle } from "./embedder";

// Content-hash deduplication
export { contentHash, shouldEmbed, markEmbedded } from "./dedup";
export type { ShouldEmbedOpts } from "./dedup";

// Cost tracking
export {
  PRICING,
  registerPricing,
  withCostContext,
  computeCostUsd,
  recordCost,
  getProjectedCost,
  checkCostCap,
  getCostSummary,
} from "./cost";
export type { CostSummaryRow, StoreOps } from "./cost";
