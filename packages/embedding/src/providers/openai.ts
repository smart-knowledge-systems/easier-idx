import type { EmbeddingProvider } from "../provider";
import { recordCost } from "../cost";
import { logEvent } from "@easier/logging";
import { retryWithBackoff } from "@easier/core";

const BATCH_SIZE = 256;

// Lazy-load the OpenAI SDK so consumers using custom providers don't need it installed.
type OpenAIClient = InstanceType<typeof import("openai").default>;
type OpenAIAPIError = InstanceType<typeof import("openai").default.APIError>;

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
    return retryWithBackoff(
      async () => {
        const response = await this.getClient().embeddings.create({
          model: this.name,
          dimensions: this.dimensions,
          input: texts,
        });
        if (response.usage?.total_tokens) {
          await recordCost("embed", this.name, response.usage.total_tokens, 0);
        }

        logEvent({
          event: "embed.batch_complete",
          provider: this.name,
          text_count: texts.length,
        });

        const embeddings = new Array<number[]>(response.data.length);
        for (const item of response.data) {
          embeddings[item.index] = item.embedding;
        }
        return embeddings;
      },
      {
        isRetryable: (err) =>
          err instanceof OpenAI.APIError &&
          (err as OpenAIAPIError).status === 429,
        onRetry: (attempt, delayMs, err) => {
          logEvent({
            event: "embed.retry",
            provider: this.name,
            attempt,
            delay_ms: delayMs,
            "error.type": "rate_limit",
            "error.message": err instanceof Error ? err.message : String(err),
          });
        },
      },
    );
  }

  async embed(texts: string[]): Promise<number[][]> {
    const batches = Array.from(
      { length: Math.ceil(texts.length / BATCH_SIZE) },
      (_, i) => texts.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
    );
    const results: number[][] = [];
    for (const batch of batches) {
      results.push(...(await this.embedBatch(batch)));
    }
    return results;
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}
