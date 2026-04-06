import type { BatchClient, BatchSubmitResult } from "./types";

/**
 * Submit a batch of requests to the Anthropic Batch API.
 * Returns the batch ID and request count.
 */
export async function submitBatch(
  client: BatchClient,
  requests: unknown[],
): Promise<BatchSubmitResult> {
  const response = await client.messages.batches.create({ requests });
  return {
    batchId: response.id,
    requestCount: requests.length,
  };
}
