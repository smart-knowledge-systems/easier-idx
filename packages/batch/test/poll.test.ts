import { describe, expect, test } from "bun:test";
import { pollBatch, pollBatches } from "../src/poll";
import type { BatchClient, RequestCounts } from "../src/types";

// ── Helpers ─────────────────────────────────────────────────────────────

function mockClient(
  statuses: Record<
    string,
    { processing_status: string; request_counts: RequestCounts }
  >,
): BatchClient {
  return {
    messages: {
      batches: {
        async create() {
          throw new Error("not implemented");
        },
        async retrieve(id: string) {
          const entry = statuses[id];
          if (!entry) throw new Error(`Unknown batch: ${id}`);
          return entry;
        },
        results() {
          throw new Error("not implemented");
        },
      },
    },
  };
}

const ENDED_COUNTS: RequestCounts = {
  succeeded: 10,
  errored: 1,
  expired: 0,
  canceled: 0,
  processing: 0,
};

const PROCESSING_COUNTS: RequestCounts = {
  succeeded: 3,
  errored: 0,
  expired: 0,
  canceled: 0,
  processing: 7,
};

// ── Tests ───────────────────────────────────────────────────────────────

describe("pollBatch", () => {
  test("returns done=true when processing_status is ended", async () => {
    const client = mockClient({
      batch_1: { processing_status: "ended", request_counts: ENDED_COUNTS },
    });

    const result = await pollBatch(client, "batch_1");

    expect(result.done).toBe(true);
    expect(result.counts).toEqual(ENDED_COUNTS);
  });

  test("returns done=false when processing_status is not ended", async () => {
    const client = mockClient({
      batch_2: {
        processing_status: "in_progress",
        request_counts: PROCESSING_COUNTS,
      },
    });

    const result = await pollBatch(client, "batch_2");

    expect(result.done).toBe(false);
    expect(result.counts).toEqual(PROCESSING_COUNTS);
  });
});

describe("pollBatches", () => {
  test("returns a map of all batch results", async () => {
    const client = mockClient({
      batch_a: { processing_status: "ended", request_counts: ENDED_COUNTS },
      batch_b: {
        processing_status: "in_progress",
        request_counts: PROCESSING_COUNTS,
      },
    });

    const results = await pollBatches(client, ["batch_a", "batch_b"]);

    expect(results).toBeInstanceOf(Map);
    expect(results.size).toBe(2);
    expect(results.get("batch_a")!.done).toBe(true);
    expect(results.get("batch_b")!.done).toBe(false);
    expect(results.get("batch_a")!.counts).toEqual(ENDED_COUNTS);
    expect(results.get("batch_b")!.counts).toEqual(PROCESSING_COUNTS);
  });

  test("handles empty batch list", async () => {
    const client = mockClient({});

    const results = await pollBatches(client, []);

    expect(results.size).toBe(0);
  });
});
