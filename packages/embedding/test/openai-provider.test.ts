// ---------------------------------------------------------------------------
// OpenAIEmbeddingProvider parity tests
// Validates token-budget batching, recursive batch-split on 400, graceful
// per-batch skip, Retry-After header, and 5xx/429 retry paths.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Fake OpenAI SDK shape that matches the subset the provider uses.
class FakeAPIError extends Error {
  status: number;
  headers: Record<string, string | null | undefined>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

interface FakeClientOpts {
  onCreate: (input: string[]) => Promise<{ data: { index: number; embedding: number[] }[] }>;
}

function makeFakeOpenAIModule(clientOpts: FakeClientOpts) {
  const Client = class {
    embeddings = {
      create: async (args: { input: string[] }) => clientOpts.onCreate(args.input),
    };
  };
  return {
    default: Object.assign(Client, { APIError: FakeAPIError }),
    APIError: FakeAPIError,
  };
}

// Install the fake openai module into Node's require cache before importing
// the provider, which lazily `require("openai")`.
function installFakeOpenAI(clientOpts: FakeClientOpts): void {
  const fake = makeFakeOpenAIModule(clientOpts);
  // Bun/Node require cache
  const req = require as unknown as {
    cache: Record<string, { exports: unknown }>;
    resolve: (id: string) => string;
  };
  const resolved = req.resolve("openai");
  req.cache[resolved] = { exports: fake };
}

function uninstallFakeOpenAI(): void {
  const req = require as unknown as {
    cache: Record<string, { exports: unknown }>;
    resolve: (id: string) => string;
  };
  try {
    const resolved = req.resolve("openai");
    delete req.cache[resolved];
  } catch {
    /* ignore */
  }
}

// Silence stderr progress lines during tests.
const stderrWrite = mock(() => true);
const realWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  (process.stderr as unknown as { write: unknown }).write = stderrWrite;
});
afterEach(() => {
  (process.stderr as unknown as { write: unknown }).write = realWrite;
  uninstallFakeOpenAI();
  // Drop the module cache for the provider so each test gets a fresh client binding
  const req = require as unknown as {
    cache: Record<string, { exports: unknown }>;
    resolve: (id: string) => string;
  };
  try {
    const p = req.resolve("../src/providers/openai");
    delete req.cache[p];
  } catch {
    /* ignore */
  }
});

function makeEmbedding(dim: number, seed: number): number[] {
  return Array.from({ length: dim }, (_, i) => (i + seed) / (dim + seed));
}

describe("OpenAIEmbeddingProvider parity", () => {
  test("token-budget batching splits oversized input into multiple calls", async () => {
    const calls: string[][] = [];
    installFakeOpenAI({
      onCreate: async (input) => {
        calls.push(input);
        return {
          data: input.map((_, i) => ({ index: i, embedding: makeEmbedding(4, i) })),
        };
      },
    });

    const { OpenAIEmbeddingProvider } = await import("../src/providers/openai");
    const provider = new OpenAIEmbeddingProvider("text-embedding-3-small", 4);

    // Each string is ~150_000 chars ≈ 100_000 tokens.
    // MAX_BATCH_TOKENS = 200_000 → each batch can hold at most 2 strings.
    const big = "x".repeat(150_000);
    const result = await provider.embed([big, big, big, big, big]);

    expect(result.length).toBe(5);
    // Expect 3 batches: [2, 2, 1]
    expect(calls.length).toBe(3);
    expect(calls[0].length).toBe(2);
    expect(calls[1].length).toBe(2);
    expect(calls[2].length).toBe(1);
  });

  test("recursive batch-split on 400 'maximum request size'", async () => {
    let callCount = 0;
    const callSizes: number[] = [];
    installFakeOpenAI({
      onCreate: async (input) => {
        callCount++;
        callSizes.push(input.length);
        // Fail the first call (the full batch), succeed on halves.
        if (callCount === 1) {
          throw new FakeAPIError(400, "maximum request size exceeded");
        }
        return {
          data: input.map((_, i) => ({ index: i, embedding: makeEmbedding(4, i) })),
        };
      },
    });

    const { OpenAIEmbeddingProvider } = await import("../src/providers/openai");
    const provider = new OpenAIEmbeddingProvider("text-embedding-3-small", 4);

    const result = await provider.embed(["a", "b", "c", "d"]);
    expect(result.length).toBe(4);
    // First call = full batch of 4 (fails), then two halves of 2 each.
    expect(callSizes[0]).toBe(4);
    expect(callSizes.slice(1).sort()).toEqual([2, 2]);
  });

  test("graceful per-batch skip returns empty embeddings on failure", async () => {
    installFakeOpenAI({
      onCreate: async () => {
        // Non-token-limit 400 error → retry logic doesn't engage, split doesn't apply
        // with a single-item batch. Should propagate to the batch-skip guard.
        throw new FakeAPIError(400, "bad request");
      },
    });

    const { OpenAIEmbeddingProvider } = await import("../src/providers/openai");
    const provider = new OpenAIEmbeddingProvider("text-embedding-3-small", 4);

    const result = await provider.embed(["only one"]);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual([]);
  });

  test("retries on 429 and honors Retry-After header", async () => {
    const delays: number[] = [];
    let callCount = 0;
    installFakeOpenAI({
      onCreate: async (input) => {
        callCount++;
        if (callCount === 1) {
          throw new FakeAPIError(429, "rate limited", { "retry-after": "0.01" });
        }
        return {
          data: input.map((_, i) => ({ index: i, embedding: makeEmbedding(4, i) })),
        };
      },
    });

    const { OpenAIEmbeddingProvider } = await import("../src/providers/openai");
    const provider = new OpenAIEmbeddingProvider("text-embedding-3-small", 4);

    const start = Date.now();
    const result = await provider.embed(["one"]);
    const elapsed = Date.now() - start;
    delays.push(elapsed);

    expect(result.length).toBe(1);
    expect(callCount).toBe(2);
    // 10ms from retry-after header (plus ±25% jitter). Well under the
    // 1000ms default exponential base that would otherwise apply.
    expect(elapsed).toBeLessThan(100);
  });

  test("retries on 5xx status", async () => {
    let callCount = 0;
    installFakeOpenAI({
      onCreate: async (input) => {
        callCount++;
        if (callCount < 3) throw new FakeAPIError(503, "service unavailable");
        return {
          data: input.map((_, i) => ({ index: i, embedding: makeEmbedding(4, i) })),
        };
      },
    });

    const { OpenAIEmbeddingProvider } = await import("../src/providers/openai");
    const provider = new OpenAIEmbeddingProvider("text-embedding-3-small", 4);

    // Stub retry backoff to be fast by using a small input; openai provider's
    // base delay is 1000ms × 2^attempt. Keep tries low via retryable-only
    // behavior; accept the wall-clock cost (~3s) as a signal the retry works.
    // To avoid flakiness we only check that it ultimately succeeds.
    const result = await provider.embed(["one"]);
    expect(result.length).toBe(1);
    expect(callCount).toBe(3);
  }, 20_000);
});
