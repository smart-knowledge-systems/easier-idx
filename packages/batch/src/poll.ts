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
 * Limits concurrency to avoid API rate limiting (default: 10).
 */
export async function pollBatches(
  client: BatchClient,
  batchIds: string[],
  options?: { concurrency?: number },
): Promise<Map<string, BatchPollResult>> {
  const concurrency = options?.concurrency ?? 10;
  const results: [string, BatchPollResult][] = [];

  for (let i = 0; i < batchIds.length; i += concurrency) {
    const chunk = batchIds.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        const result = await pollBatch(client, id);
        return [id, result] as const;
      }),
    );
    results.push(
      ...chunkResults.map(([id, r]) => [id, r] as [string, BatchPollResult]),
    );
  }

  return new Map(results);
}
