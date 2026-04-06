// ---------------------------------------------------------------------------
// Matryoshka dimension-reduction wrapper
// Truncates embeddings to a target dimension and L2-renormalizes.
// Works with any Matryoshka-capable model (Qwen3-Embedding, nomic-embed-text
// v1.5, OpenAI text-embedding-3-*).
// ---------------------------------------------------------------------------

import type { EmbeddingProvider } from "../provider";

/** Truncate a vector and L2-renormalize for cosine similarity correctness. */
function truncateAndNormalize(vec: number[], dims: number): number[] {
  const truncated = vec.slice(0, dims);
  let norm = 0;
  for (let i = 0; i < truncated.length; i++)
    norm += truncated[i] * truncated[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < truncated.length; i++) truncated[i] /= norm;
  }
  return truncated;
}

/**
 * Wraps any EmbeddingProvider to reduce output dimensions via Matryoshka
 * truncation. Truncates to `targetDimensions` and L2-renormalizes so cosine
 * similarity remains valid.
 *
 * @example
 * ```ts
 * const ollama = new OllamaEmbeddingProvider("qwen3-embedding:4b", 2560);
 * const provider = new MatryoshkaProvider(ollama, 1024);
 * // provider.dimensions === 1024
 * // provider.name === "qwen3-embedding:4b@1024d"
 * ```
 */
export class MatryoshkaProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private readonly inner: EmbeddingProvider;

  constructor(inner: EmbeddingProvider, targetDimensions: number) {
    if (targetDimensions <= 0) {
      throw new Error(
        `MatryoshkaProvider: targetDimensions must be positive, got ${targetDimensions}`,
      );
    }
    if (targetDimensions > inner.dimensions) {
      throw new Error(
        `MatryoshkaProvider: targetDimensions (${targetDimensions}) exceeds inner provider dimensions (${inner.dimensions})`,
      );
    }
    this.inner = inner;
    this.dimensions = targetDimensions;
    this.name = `${inner.name}@${targetDimensions}d`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const raw = await this.inner.embed(texts);
    return raw.map((v) => truncateAndNormalize(v, this.dimensions));
  }

  async embedSingle(text: string): Promise<number[]> {
    const raw = await this.inner.embedSingle(text);
    return truncateAndNormalize(raw, this.dimensions);
  }
}
