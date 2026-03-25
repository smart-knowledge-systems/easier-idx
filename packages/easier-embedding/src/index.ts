// ---------------------------------------------------------------------------
// @easier/embedding — barrel export
// ---------------------------------------------------------------------------

// Types
export type { EmbeddingProvider } from "./provider";
export type { EmbeddingConfig } from "./types";

// Providers
export { OpenAIEmbeddingProvider } from "./providers/openai";
export { OllamaEmbeddingProvider } from "./providers/ollama";
export { RemoteEmbeddingProvider } from "./providers/remote";

// Embedder
export { getProvider, resetProvider, embed, embedSingle } from "./embedder";

// Cost
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
