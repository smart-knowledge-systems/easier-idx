/** Request counts returned by the Anthropic Batch API. */
export interface RequestCounts {
  succeeded: number;
  errored: number;
  expired: number;
  canceled: number;
  processing: number;
}

/**
 * Structural type for the Anthropic client's batch API surface.
 * Duck-typed — no SDK import required. Any object with this shape works.
 */
export interface BatchClient {
  messages: {
    batches: {
      create(params: { requests: unknown[] }): Promise<{
        id: string;
        processing_status: string;
        request_counts: RequestCounts;
      }>;
      retrieve(id: string): Promise<{
        processing_status: string;
        request_counts: RequestCounts;
      }>;
      results(id: string): AsyncIterable<{
        custom_id: string;
        result: {
          type: string;
          message?: {
            content: unknown[];
            usage: unknown;
          };
        };
      }>;
    };
  };
}

export interface BatchSubmitResult {
  batchId: string;
  requestCount: number;
}

export interface BatchPollResult {
  done: boolean;
  counts: RequestCounts;
}
