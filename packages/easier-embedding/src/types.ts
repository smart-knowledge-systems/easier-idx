/** Embedding provider config. */
export interface EmbeddingConfig {
  readonly model: string;
  readonly dimensions: number;
  readonly provider: "openai" | "ollama" | "remote";
  readonly ollamaUrl?: string;
  readonly remoteUrl?: string;
  readonly remoteAuth?: string;
}
