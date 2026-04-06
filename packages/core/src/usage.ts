// ---------------------------------------------------------------------------
// Shared token usage tracking — used across glossary, description, connection,
// batch, and consumer projects.
// ---------------------------------------------------------------------------

/** Token usage breakdown for an LLM call. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/** Return a zeroed-out TokenUsage object. */
export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

/** Accumulate `delta` into `totals` in place. Undefined fields are treated as 0. */
export function accumUsage(
  totals: TokenUsage,
  delta: Partial<TokenUsage>,
): void {
  totals.inputTokens += delta.inputTokens ?? 0;
  totals.outputTokens += delta.outputTokens ?? 0;
  totals.cacheCreationInputTokens += delta.cacheCreationInputTokens ?? 0;
  totals.cacheReadInputTokens += delta.cacheReadInputTokens ?? 0;
}
