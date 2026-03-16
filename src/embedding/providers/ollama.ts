import type { EmbeddingProvider } from "../provider";
import { recordCost } from "../../cost/cost";
import { logEvent } from "../../logging/logging";

const BATCH_SIZE = 64;
const MAX_RETRIES = 3;

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

  private async embedBatch(texts: string[], attempt = 0): Promise<number[][]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.name, input: texts }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as { embeddings: number[][] };

      const approxTokens = texts.reduce(
        (sum, t) => sum + Math.ceil(t.length / 4),
        0,
      );
      await recordCost("embed", this.name, approxTokens, 0);

      logEvent({
        event: "embed.batch_complete",
        provider: this.name,
        text_count: texts.length,
      });

      return data.embeddings;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt);
        logEvent({
          event: "embed.retry",
          provider: this.name,
          attempt: attempt + 1,
          delay_ms: delay,
          "error.message": err instanceof Error ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.embedBatch(texts, attempt + 1);
      }
      logEvent({
        event: "embed.failed",
        provider: this.name,
        "error.type": err instanceof Error ? err.constructor.name : "unknown",
        "error.message": err instanceof Error ? err.message : String(err),
        "error.retriable": false,
      });
      throw err;
    }
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
