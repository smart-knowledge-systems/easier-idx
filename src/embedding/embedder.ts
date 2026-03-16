import type { EmbeddingProvider } from "./provider";
import type { EasierConfig } from "../types";
import { OpenAIEmbeddingProvider } from "./providers/openai";
import { OllamaEmbeddingProvider } from "./providers/ollama";
import { RemoteEmbeddingProvider } from "./providers/remote";
import { logEvent } from "../logging/logging";

const MAX_EMBED_CHARS = 4_000;

function sanitize(text: string): string {
  if (text.length === 0) return " ";
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
}

/** Build a cache key from embedding config. */
function providerCacheKey(config?: EasierConfig): string {
  if (!config) return "openai:text-embedding-3-small:1536:";
  const { provider, model, dimensions, ollamaUrl, remoteUrl } =
    config.embedding;
  return `${provider}:${model}:${dimensions}:${ollamaUrl ?? ""}:${remoteUrl ?? ""}`;
}

/** Construct a new provider from config. */
function createProvider(config?: EasierConfig): EmbeddingProvider {
  if (!config) return new OpenAIEmbeddingProvider();
  const { provider, model, dimensions, ollamaUrl, remoteUrl, remoteAuth } =
    config.embedding;
  if (provider === "ollama")
    return new OllamaEmbeddingProvider(model, dimensions, ollamaUrl);
  if (provider === "remote")
    return new RemoteEmbeddingProvider(
      model,
      dimensions,
      remoteUrl,
      remoteAuth,
    );
  return new OpenAIEmbeddingProvider(model, dimensions);
}

const providerCache = (() => {
  const cache = new Map<string, EmbeddingProvider>();
  return {
    getOrCreate(config?: EasierConfig): EmbeddingProvider {
      const key = providerCacheKey(config);
      const cached = cache.get(key);
      if (cached) return cached;
      const provider = createProvider(config);
      cache.set(key, provider);
      return provider;
    },
    clear(): void {
      cache.clear();
    },
  };
})();

/** Get or create the configured embedding provider. */
export function getProvider(config?: EasierConfig): EmbeddingProvider {
  return providerCache.getOrCreate(config);
}

/** Reset all cached providers. */
export function resetProvider(): void {
  providerCache.clear();
}

export async function embed(
  texts: string | string[],
  config?: EasierConfig,
): Promise<number[][]> {
  const input = (Array.isArray(texts) ? texts : [texts]).map(sanitize);
  const result = await getProvider(config).embed(input);
  logEvent({ event: "embed.complete", text_count: input.length });
  return result;
}

export async function embedSingle(
  text: string,
  config?: EasierConfig,
): Promise<number[]> {
  return getProvider(config).embedSingle(sanitize(text));
}
