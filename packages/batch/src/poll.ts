import type { BatchClient, BatchPollResult, RequestCounts } from "./types";

/**
 * Poll a single batch for status. Returns whether it's done and current counts.
 */
export async function pollBatch(
  client: BatchClient,
  batchId: string,
): Promise<BatchPollResult> {
  const status = await client.messages.batches.retrieve(batchId);
  return {
    done: status.processing_status === "ended",
    counts: status.request_counts,
  };
}

/**
 * Poll multiple batches in parallel. Returns a map of batchId -> result.
 */
export async function pollBatches(
  client: BatchClient,
  batchIds: string[],
): Promise<Map<string, BatchPollResult>> {
  const results = await Promise.all(
    batchIds.map(async (id) => {
      const result = await pollBatch(client, id);
      return [id, result] as const;
    }),
  );
  return new Map(results);
}
