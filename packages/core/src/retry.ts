// ---------------------------------------------------------------------------
// Shared retry with exponential backoff
// STEERING #6 (explicit over implicit) — all options passed as parameters
// ---------------------------------------------------------------------------

import { logEvent } from "@easier-idx/logging";

export interface RetryOpts {
  /** Maximum number of retries (default: 3). */
  readonly maxRetries?: number;
  /** Base delay in milliseconds, doubled each retry (default: 1000). */
  readonly baseDelayMs?: number;
  /** Upper bound on per-attempt delay, applied after jitter (default: unbounded). */
  readonly maxDelayMs?: number;
  /**
   * Jitter factor in [0, 1). The computed delay is multiplied by
   * `1 + (Math.random() - 0.5) * 2 * jitterFactor`, i.e. ±jitterFactor
   * randomization. Default: 0 (no jitter).
   */
  readonly jitterFactor?: number;
  /** Predicate to determine if an error is transient (default: 429 + TypeError). */
  readonly isRetryable?: (err: unknown) => boolean;
  /**
   * Optional hook consulted before computing backoff. If it returns a finite
   * number of milliseconds (e.g. parsed from a Retry-After header), that value
   * is used instead of the exponential backoff for this attempt. The jitter
   * and maxDelayMs cap still apply to the returned value.
   */
  readonly retryAfterMs?: (err: unknown) => number | null;
  /** Callback fired before each retry sleep. */
  readonly onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
  /**
   * Name of the structured log event emitted on each retry. Pass `null` to
   * suppress the built-in event entirely — useful when the caller's `onRetry`
   * emits a domain-specific event instead. Default: `"retry"`.
   */
  readonly eventName?: string | null;
}

/** Default transient error check: HTTP 429 or network TypeError. */
function defaultIsRetryable(err: unknown): boolean {
  if (
    err != null &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status: unknown }).status === 429
  ) {
    return true;
  }
  return err instanceof TypeError;
}

/**
 * Retry a function with exponential backoff.
 *
 * @param fn   - Async function to attempt. Receives 0-based attempt number.
 * @param opts - Retry configuration.
 * @returns The result of the first successful call.
 * @throws The last error if all attempts are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: RetryOpts,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  const maxDelayMs = opts?.maxDelayMs ?? Number.POSITIVE_INFINITY;
  const jitterFactor = opts?.jitterFactor ?? 0;
  const isRetryable = opts?.isRetryable ?? defaultIsRetryable;
  const eventName = opts?.eventName === undefined ? "retry" : opts.eventName;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const isLast = attempt >= maxRetries;
      if (isLast || !isRetryable(err)) {
        throw err;
      }

      // Start from either a caller-provided retry-after hint or exponential backoff.
      const hinted = opts?.retryAfterMs?.(err);
      let delayMs =
        hinted != null && Number.isFinite(hinted)
          ? hinted
          : baseDelayMs * Math.pow(2, attempt);

      // Apply jitter (±jitterFactor) if configured.
      if (jitterFactor > 0) {
        delayMs *= 1 + (Math.random() - 0.5) * 2 * jitterFactor;
      }

      // Cap.
      if (delayMs > maxDelayMs) delayMs = maxDelayMs;

      opts?.onRetry?.(attempt + 1, delayMs, err);
      if (eventName !== null) {
        logEvent({
          event: eventName,
          attempt: attempt + 1,
          delay_ms: delayMs,
          "error.message": err instanceof Error ? err.message : String(err),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable — the loop either returns or throws
  throw new Error("retryWithBackoff: unexpected loop exit");
}
