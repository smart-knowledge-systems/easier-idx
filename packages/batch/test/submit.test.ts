import { describe, expect, test } from "bun:test";
import { submitBatch } from "../src/submit";
import type { BatchClient } from "../src/types";

// ── Helpers ─────────────────────────────────────────────────────────────

function mockClient(batchId: string): BatchClient & { recorded: unknown[][] } {
  const recorded: unknown[][] = [];
  return {
    recorded,
    messages: {
      batches: {
        async create(params: { requests: unknown[] }) {
          recorded.push(params.requests);
          return {
            id: batchId,
            processing_status: "in_progress",
            request_counts: {
              succeeded: 0,
              errored: 0,
              expired: 0,
              canceled: 0,
              processing: params.requests.length,
            },
          };
        },
        async retrieve() {
          throw new Error("not implemented");
        },
        results() {
          throw new Error("not implemented");
        },
      },
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("submitBatch", () => {
  test("returns batchId and requestCount", async () => {
    const client = mockClient("batch_abc123");
    const requests = [
      { custom_id: "r1" },
      { custom_id: "r2" },
      { custom_id: "r3" },
    ];

    const result = await submitBatch(client, requests);

    expect(result.batchId).toBe("batch_abc123");
    expect(result.requestCount).toBe(3);
  });

  test("passes requests to client.messages.batches.create", async () => {
    const client = mockClient("batch_xyz");
    const requests = [{ custom_id: "a" }, { custom_id: "b" }];

    await submitBatch(client, requests);

    expect(client.recorded).toHaveLength(1);
    expect(client.recorded[0]).toEqual(requests);
  });

  test("handles empty request array", async () => {
    const client = mockClient("batch_empty");

    const result = await submitBatch(client, []);

    expect(result.batchId).toBe("batch_empty");
    expect(result.requestCount).toBe(0);
  });
});
