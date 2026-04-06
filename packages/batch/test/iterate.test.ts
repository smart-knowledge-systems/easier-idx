import { describe, expect, test } from "bun:test";
import { iterateResults } from "../src/iterate";
import type { BatchClient } from "../src/types";

// ── Helpers ─────────────────────────────────────────────────────────────

interface MockEntry {
  custom_id: string;
  result: {
    type: string;
    message?: {
      content: unknown[];
      usage: unknown;
    };
  };
}

function mockClient(entries: MockEntry[]): BatchClient {
  return {
    messages: {
      batches: {
        async create() {
          throw new Error("not implemented");
        },
        async retrieve() {
          throw new Error("not implemented");
        },
        results(_id: string): AsyncIterable<MockEntry> {
          return {
            [Symbol.asyncIterator]() {
              let i = 0;
              return {
                async next() {
                  if (i < entries.length) {
                    return { value: entries[i++], done: false };
                  }
                  return { value: undefined, done: true };
                },
              };
            },
          };
        },
      },
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("iterateResults", () => {
  test("yields parsed data for succeeded entries", async () => {
    const client = mockClient([
      {
        custom_id: "r1",
        result: {
          type: "succeeded",
          message: { content: [{ type: "text", text: "hello" }], usage: {} },
        },
      },
      {
        custom_id: "r2",
        result: {
          type: "succeeded",
          message: { content: [{ type: "text", text: "world" }], usage: {} },
        },
      },
    ]);

    const results = [];
    for await (const item of iterateResults(
      client,
      "batch_1",
      (_id, msg) => msg,
    )) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
    expect(results[0].customId).toBe("r1");
    expect(results[0].data).toBeDefined();
    expect(results[0].error).toBeUndefined();
    expect(results[1].customId).toBe("r2");
  });

  test("yields error for failed entries", async () => {
    const client = mockClient([
      {
        custom_id: "r1",
        result: { type: "errored" },
      },
    ]);

    const results = [];
    for await (const item of iterateResults(
      client,
      "batch_1",
      (_id, msg) => msg,
    )) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0].customId).toBe("r1");
    expect(results[0].error).toBeDefined();
    expect(results[0].data).toBeUndefined();
  });

  test("yields error when parse throws", async () => {
    const client = mockClient([
      {
        custom_id: "r1",
        result: {
          type: "succeeded",
          message: { content: [], usage: {} },
        },
      },
    ]);

    const results = [];
    for await (const item of iterateResults(client, "batch_1", () => {
      throw new Error("parse failed");
    })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0].customId).toBe("r1");
    expect(results[0].error).toBeInstanceOf(Error);
    expect(results[0].data).toBeUndefined();
  });

  test("handles mix of succeeded and failed entries", async () => {
    const client = mockClient([
      {
        custom_id: "ok",
        result: {
          type: "succeeded",
          message: { content: [{ type: "text", text: "good" }], usage: {} },
        },
      },
      {
        custom_id: "fail",
        result: { type: "errored" },
      },
      {
        custom_id: "expired",
        result: { type: "expired" },
      },
    ]);

    const successes = [];
    const errors = [];
    for await (const item of iterateResults(
      client,
      "batch_1",
      (_id, msg) => msg,
    )) {
      if (item.error !== undefined) {
        errors.push(item);
      } else {
        successes.push(item);
      }
    }

    expect(successes).toHaveLength(1);
    expect(successes[0].customId).toBe("ok");
    expect(errors).toHaveLength(2);
    expect(errors[0].customId).toBe("fail");
    expect(errors[1].customId).toBe("expired");
  });

  test("handles empty results", async () => {
    const client = mockClient([]);

    const results = [];
    for await (const item of iterateResults(
      client,
      "batch_1",
      (_id, msg) => msg,
    )) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });
});
