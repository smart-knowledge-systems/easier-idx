import type { EmbeddingProvider } from "../provider";
import { recordCost } from "../cost";
import { logEvent } from "@easier-idx/logging";
import { retryWithBackoff } from "@easier-idx/core";

// OpenAI embeddings API has a 300K token-per-request limit.
// We batch by both item count and estimated token budget.
const MAX_BATCH_ITEMS = 256;
const MAX_BATCH_TOKENS = 200_000; // conservative to stay under 300K hard limit
const CHARS_PER_TOKEN = 1.5; // code with identifiers averages ~1.5 chars per token
const MAX_RETRIES = 6;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

// Lazy-load the OpenAI SDK so consumers using custom providers don't need it installed.
type OpenAIClient = InstanceType<typeof import("openai").default>;
type OpenAIAPIErrorClass = typeof import("openai").default.APIError;

let _OpenAI: typeof import("openai").default | undefined;
function loadOpenAI(): typeof import("openai").default {
  if (!_OpenAI) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _OpenAI = require("openai").default ?? require("openai");
    } catch {
      throw new Error(
        "OpenAIEmbeddingProvider requires the `openai` package. Install it with: npm install openai",
      );
    }
  }
  return _OpenAI!;
}

function isApiErrorStatus(
  err: unknown,
  APIError: OpenAIAPIErrorClass,
): boolean {
  return err instanceof APIError;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private client: OpenAIClient | null = null;

  constructor(model = "text-embedding-3-small", dimensions = 1536) {
    this.name = model;
    this.dimensions = dimensions;
  }

  private getClient(): OpenAIClient {
    if (!this.client) {
      const OpenAI = loadOpenAI();
      this.client = new OpenAI();
    }
    return this.client;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const OpenAI = loadOpenAI();
    const APIError = OpenAI.APIError;
    try {
      return await retryWithBackoff(
        async () => {
          const response = await this.getClient().embeddings.create({
            model: this.name,
            dimensions: this.dimensions,
            input: texts,
          });
          if (response.usage?.total_tokens) {
            await recordCost(
              "embed",
              this.name,
              response.usage.total_tokens,
              0,
            );
          }

          logEvent({
            event: "infra.embed.batch_complete",
            provider: this.name,
            text_count: texts.length,
          });

          // Map by index, falling back to empty embedding for any missing slots
          const embeddings: number[][] = [];
          for (let i = 0; i < texts.length; i++) embeddings.push([]);
          for (const item of response.data) {
            embeddings[item.index] = item.embedding;
          }
          return embeddings;
        },
        {
          maxRetries: MAX_RETRIES,
          baseDelayMs: BACKOFF_BASE_MS,
          maxDelayMs: BACKOFF_MAX_MS,
          jitterFactor: 0.25,
          eventName: null, // caller emits infra.embed.retry instead
          isRetryable: (err) => {
            if (!isApiErrorStatus(err, APIError)) return false;
            const status =
              (err as InstanceType<OpenAIAPIErrorClass>).status ?? 0;
            return status === 429 || status >= 500;
          },
          retryAfterMs: (err) => {
            if (!isApiErrorStatus(err, APIError)) return null;
            const headers = (err as InstanceType<OpenAIAPIErrorClass>)
              .headers as
              | Record<string, string | null | undefined>
              | { get?: (k: string) => string | null }
              | undefined;
            if (!headers) return null;
            // openai v4: headers is a Record; v5: Headers-like with .get()
            const hdr =
              typeof (headers as { get?: unknown }).get === "function"
                ? ((headers as { get: (k: string) => string | null }).get(
                    "retry-after",
                  ) ?? null)
                : ((headers as Record<string, string | null | undefined>)[
                    "retry-after"
                  ] ?? null);
            if (!hdr) return null;
            const parsed = parseFloat(hdr);
            return Number.isFinite(parsed) ? parsed * 1000 : null;
          },
          onRetry: (attempt, delayMs, err) => {
            const status =
              err instanceof APIError
                ? ((err as InstanceType<OpenAIAPIErrorClass>).status ?? 0)
                : 0;
            const errorType = status === 429 ? "rate_limit" : "server_error";
            logEvent({
              event: "infra.embed.retry",
              provider: this.name,
              attempt,
              delay_ms: Math.round(delayMs),
              "error.type": errorType,
              "error.message": err instanceof Error ? err.message : String(err),
            });
            const reason =
              status === 429 ? "Rate limited" : `Server error ${status}`;
            process.stderr.write(
              `  ${reason} — retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/${MAX_RETRIES})\n`,
            );
          },
        },
      );
    } catch (err) {
      // Retry 400 "maximum request size" errors by splitting the batch in half.
      const isTokenLimit =
        err instanceof APIError &&
        (err as InstanceType<OpenAIAPIErrorClass>).status === 400 &&
        (err as Error).message?.includes("maximum request size");
      if (isTokenLimit && texts.length > 1) {
        logEvent({
          event: "infra.embed.batch_split",
          provider: this.name,
          original_size: texts.length,
        });
        const mid = Math.ceil(texts.length / 2);
        const [left, right] = await Promise.all([
          this.embedBatch(texts.slice(0, mid)),
          this.embedBatch(texts.slice(mid)),
        ]);
        return [...left, ...right];
      }

      // Caller (embed) logs infra.embed.batch_skipped with the error details;
      // embedSingle surfaces the thrown error to its caller. Avoid double-logging here.
      throw err;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Token-budget batching: flush when we hit either the item cap
    // or the estimated-token cap, whichever comes first.
    const batches: string[][] = [];
    let current: string[] = [];
    let currentTokens = 0;

    for (const text of texts) {
      const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
      if (
        current.length > 0 &&
        (current.length >= MAX_BATCH_ITEMS ||
          currentTokens + estimatedTokens > MAX_BATCH_TOKENS)
      ) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }
      current.push(text);
      currentTokens += estimatedTokens;
    }
    if (current.length > 0) batches.push(current);

    // Graceful per-batch skip: one doomed batch shouldn't abort a full reindex.
    const results: number[][] = [];
    for (const batch of batches) {
      try {
        results.push(...(await this.embedBatch(batch)));
      } catch (err) {
        process.stderr.write(
          `  WARN: batch of ${batch.length} texts failed, skipping: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        logEvent({
          event: "infra.embed.batch_skipped",
          provider: this.name,
          batch_size: batch.length,
          "error.message": err instanceof Error ? err.message : String(err),
        });
        for (let i = 0; i < batch.length; i++) results.push([]);
      }
    }
    return results;
  }

  async embedSingle(text: string): Promise<number[]> {
    // Call embedBatch directly to bypass the graceful per-batch skip in embed().
    // embedSingle is a point lookup — silently returning [] on failure would
    // corrupt downstream vector consumers (cosine similarity, k-NN).
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }
}
