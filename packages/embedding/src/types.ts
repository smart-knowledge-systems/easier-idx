/**
 * Embedding provider config — used by built-in providers in @easier/embedding/providers.
 * Not required when bringing your own EmbeddingProvider.
 */
export interface EmbeddingConfig {
  readonly model: string;
  readonly dimensions: number;
  readonly provider: "openai" | "ollama" | "remote";
  readonly ollamaUrl?: string;
  readonly remoteUrl?: string;
  readonly remoteAuth?: string;
}
