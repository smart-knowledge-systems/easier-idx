import type { EmbeddingProvider } from "./provider";
import { logEvent } from "@easier/logging";

const MAX_EMBED_CHARS = 4_000;

function sanitize(text: string): string {
  if (text.length === 0) return " ";
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
}

/**
 * Embed one or more texts using the provided embedding provider.
 * Sanitizes inputs (empty → space, truncates to MAX_EMBED_CHARS).
 * Errors from the provider pass through to the caller.
 */
export async function embed(
  provider: EmbeddingProvider,
  texts: string | string[],
): Promise<number[][]> {
  const input = (Array.isArray(texts) ? texts : [texts]).map(sanitize);
  const result = await provider.embed(input);
  logEvent({
    event: "embed.complete",
    provider: provider.name,
    text_count: input.length,
  });
  return result;
}

/**
 * Embed a single text using the provided embedding provider.
 * Sanitizes input. Errors from the provider pass through to the caller.
 */
export async function embedSingle(
  provider: EmbeddingProvider,
  text: string,
): Promise<number[]> {
  return provider.embedSingle(sanitize(text));
}
