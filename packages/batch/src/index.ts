// Types
export type {
  RequestCounts,
  BatchClient,
  BatchSubmitResult,
  BatchPollResult,
} from "./types";

// Submit
export { submitBatch } from "./submit";

// Poll
export { pollBatch, pollBatches } from "./poll";

// Iterate
export { iterateResults } from "./iterate";
export type { IterateSuccess, IterateError } from "./iterate";

// Re-export CAS + orphan detection from core for convenience
export { casUpdate, detectOrphans } from "@easier-idx/core/cache";
export type { CasUpdateOpts, DetectOrphansOpts } from "@easier-idx/core/cache";
