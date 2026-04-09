import type { EmbeddingProvider } from "../provider";
import { logEvent } from "@easier-idx/logging";
import { retryWithBackoff } from "@easier-idx/core";

const BATCH_SIZE = 128;

interface RemoteEmbedResponse {
  embeddings: number[][];
}

/**
 * Embedding provider that delegates to a remote HTTP endpoint.
 * Expects POST { texts: string[] } → { embeddings: number[][] }.
 */
export class RemoteEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private readonly endpointUrl: string;
  private readonly authToken: string | undefined;

  constructor(
    model = "remote",
    dimensions = 1536,
    endpointUrl = "http://localhost:8080/embed",
    authToken?: string,
  ) {
    this.name = model;
    this.dimensions = dimensions;
    this.endpointUrl = endpointUrl;
    this.authToken = authToken;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    return retryWithBackoff(
      async () => {
        const response = await fetch(this.endpointUrl, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify({ texts }),
        });

        if (!response.ok) {
          const err = new Error(
            `Remote embedding API error: ${response.status} ${response.statusText}`,
          );
          (err as unknown as Record<string, unknown>).status = response.status;
          throw err;
        }

        const data = (await response.json()) as RemoteEmbedResponse;

        logEvent({
          event: "infra.embed.batch_complete",
          provider: this.name,
          text_count: texts.length,
        });

        return data.embeddings;
      },
      {
        onRetry: (attempt, delayMs, err) => {
          logEvent({
            event: "infra.embed.retry",
            provider: this.name,
            attempt,
            delay_ms: delayMs,
            error_type: err instanceof TypeError ? "network" : "rate_limit",
            error_message: err instanceof Error ? err.message : String(err),
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
