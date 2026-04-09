import { describe, expect, test } from "bun:test";
import { retryWithBackoff } from "../src/retry";

describe("retryWithBackoff", () => {
  test("returns result on first success", async () => {
    const result = await retryWithBackoff(async () => 42, {
      baseDelayMs: 1,
    });
    expect(result).toBe(42);
  });

  test("retries on transient error and succeeds", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) {
          const err = new TypeError("fetch failed");
          throw err;
        }
        return "ok";
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("throws after exhausting retries", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new TypeError("network");
        },
        { maxRetries: 2, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("network");
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  test("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new Error("fatal");
        },
        { baseDelayMs: 1 },
      ),
    ).rejects.toThrow("fatal");
    expect(calls).toBe(1);
  });

  test("retries on 429 status errors", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls === 1) {
          const err = new Error("rate limited") as Error & { status: number };
          err.status = 429;
          throw err;
        }
        return "done";
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe("done");
    expect(calls).toBe(2);
  });

  test("calls onRetry callback", async () => {
    const retries: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new TypeError("fail");
        return true;
      },
      {
        baseDelayMs: 1,
        onRetry: (attempt) => retries.push(attempt),
      },
    );
    expect(retries).toEqual([1]);
  });

  test("maxDelayMs caps delay after jitter", async () => {
    const delays: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 4) throw new TypeError("x");
        return 1;
      },
      {
        baseDelayMs: 1000,
        maxDelayMs: 5,
        jitterFactor: 0.25,
        onRetry: (_a, d) => delays.push(d),
      },
    );
    // All delays must be capped at 5ms regardless of exponential growth.
    for (const d of delays) expect(d).toBeLessThanOrEqual(5);
  });

  test("jitterFactor bounds delay within ±factor", async () => {
    const delays: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new TypeError("x");
        return 1;
      },
      {
        baseDelayMs: 100,
        jitterFactor: 0.5,
        onRetry: (_a, d) => delays.push(d),
      },
    );
    // base 100ms ± 50% → [50, 150]
    expect(delays[0]).toBeGreaterThanOrEqual(50);
    expect(delays[0]).toBeLessThanOrEqual(150);
  });

  test("retryAfterMs hook wins over exponential backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new TypeError("x");
        return 1;
      },
      {
        baseDelayMs: 10_000,
        retryAfterMs: () => 7,
        onRetry: (_a, d) => delays.push(d),
      },
    );
    expect(delays[0]).toBe(7);
  });

  test("retryAfterMs returning null falls back to exponential", async () => {
    const delays: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new TypeError("x");
        return 1;
      },
      {
        baseDelayMs: 3,
        retryAfterMs: () => null,
        onRetry: (_a, d) => delays.push(d),
      },
    );
    expect(delays[0]).toBe(3);
  });

  test("eventName: null suppresses built-in log event", async () => {
    // Smoke test — we don't assert on logEvent output but verify no throw
    // and that onRetry still fires.
    const retries: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new TypeError("x");
        return 1;
      },
      {
        baseDelayMs: 1,
        eventName: null,
        onRetry: (a) => retries.push(a),
      },
    );
    expect(retries).toEqual([1]);
  });

  test("respects custom isRetryable", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new Error("custom");
        },
        {
          baseDelayMs: 1,
          isRetryable: () => false,
        },
      ),
    ).rejects.toThrow("custom");
    expect(calls).toBe(1);
  });
});
