import type { EmbeddingProvider } from "../provider";
import { recordCost } from "../cost";
import { logEvent } from "@easier-idx/logging";
import { retryWithBackoff } from "@easier-idx/core";

const BATCH_SIZE = 64;

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private baseUrl: string;

  constructor(
    model = "nomic-embed-text",
    dimensions = 768,
    baseUrl = "http://localhost:11434",
  ) {
    this.name = model;
    this.dimensions = dimensions;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    return retryWithBackoff(
      async () => {
        const response = await fetch(`${this.baseUrl}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.name, input: texts }),
        });

        if (!response.ok) {
          const err = new Error(
            `Ollama API error: ${response.status} ${response.statusText}`,
          );
          (err as unknown as Record<string, unknown>).status = response.status;
          throw err;
        }

        const data = (await response.json()) as { embeddings: number[][] };

        const approxTokens = texts.reduce(
          (sum, t) => sum + Math.ceil(t.length / 4),
          0,
        );
        await recordCost("embed", this.name, approxTokens, 0);

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

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return {
          available: false,
          error: `Ollama server returned ${response.status}`,
        };
      }
      const data = (await response.json()) as { models: { name: string }[] };
      const modelNames = data.models.map((m) => m.name);
      const found = modelNames.some(
        (n) => n === this.name || n.startsWith(`${this.name}:`),
      );
      if (!found) {
        return {
          available: false,
          error: `Model "${this.name}" not found. Run: ollama pull ${this.name}`,
        };
      }
      return { available: true };
    } catch {
      return {
        available: false,
        error: `Cannot connect to Ollama at ${this.baseUrl}`,
      };
    }
  }
}
