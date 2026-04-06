// ---------------------------------------------------------------------------
// Shared retry with exponential backoff
// STEERING #6 (explicit over implicit) — all options passed as parameters
// ---------------------------------------------------------------------------

import { logEvent } from "@easier/logging";

export interface RetryOpts {
  /** Maximum number of retries (default: 3). */
  readonly maxRetries?: number;
  /** Base delay in milliseconds, doubled each retry (default: 1000). */
  readonly baseDelayMs?: number;
  /** Predicate to determine if an error is transient (default: 429 + TypeError). */
  readonly isRetryable?: (err: unknown) => boolean;
  /** Callback fired before each retry sleep. */
  readonly onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
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
  const isRetryable = opts?.isRetryable ?? defaultIsRetryable;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const isLast = attempt >= maxRetries;
      if (isLast || !isRetryable(err)) {
        throw err;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      opts?.onRetry?.(attempt + 1, delayMs, err);
      logEvent({
        event: "retry",
        attempt: attempt + 1,
        delay_ms: delayMs,
        "error.message": err instanceof Error ? err.message : String(err),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable — the loop either returns or throws
  throw new Error("retryWithBackoff: unexpected loop exit");
}
