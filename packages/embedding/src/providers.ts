// ---------------------------------------------------------------------------
// Built-in provider implementations — optional, import via @easier/embedding/providers
// Consumers can use these or implement their own EmbeddingProvider.
// ---------------------------------------------------------------------------

export { OpenAIEmbeddingProvider } from "./providers/openai";
export { OllamaEmbeddingProvider } from "./providers/ollama";
export { RemoteEmbeddingProvider } from "./providers/remote";
export { MatryoshkaProvider } from "./providers/matryoshka";
