import type { BatchClient } from "./types";

export interface IterateSuccess<T> {
  customId: string;
  data: T;
  error?: undefined;
}

export interface IterateError {
  customId: string;
  data?: undefined;
  error: unknown;
}

/**
 * Iterate over batch results, parsing each successful result with the provided function.
 * Yields either `{ customId, data }` for successes or `{ customId, error }` for failures.
 */
export async function* iterateResults<T>(
  client: BatchClient,
  batchId: string,
  parse: (customId: string, message: unknown) => T,
): AsyncGenerator<IterateSuccess<T> | IterateError> {
  for await (const entry of client.messages.batches.results(batchId)) {
    const customId = entry.custom_id;
    if (entry.result.type !== "succeeded" || !entry.result.message) {
      yield { customId, error: entry.result };
      continue;
    }
    try {
      const data = parse(customId, entry.result.message);
      yield { customId, data };
    } catch (err) {
      yield { customId, error: err };
    }
  }
}
