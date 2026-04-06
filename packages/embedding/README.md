# @easier/embedding

Pluggable embedding providers and cost tracking for [EASIER](https://github.com/example/easier) systems.

## Install

```bash
bun add @easier/embedding
```

## Providers

| Provider | Class | Backend |
|----------|-------|---------|
| OpenAI | `OpenAIEmbeddingProvider` | OpenAI API (requires `OPENAI_API_KEY`) |
| Ollama | `OllamaEmbeddingProvider` | Local Ollama server |
| Remote | `RemoteEmbeddingProvider` | Any HTTP endpoint returning `{ embeddings: number[][] }` |

## Quick start

```typescript
import { embed, embedSingle, getProvider } from "@easier/embedding";
import type { EmbeddingConfig } from "@easier/embedding";

const config = {
  embedding: {
    provider: "openai" as const,
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
};

// Embed a batch
const vectors = await embed(["hello world", "foo bar"], config);

// Embed a single text
const vec = await embedSingle("hello world", config);
```

## Cost tracking

```typescript
import { withCostContext, getCostSummary, checkCostCap } from "@easier/embedding";

// Wrap embedding calls in a cost context to persist cost events
await withCostContext(storeOps, async () => {
  await embed(texts, config);
});

// Check budget
const cap = await checkCostCap(storeOps, 5.0, "sqlite");
const summary = await getCostSummary(storeOps);
```

## Peer dependencies

`@easier/core` is an **optional peer dependency**. If present, structured logging via `logEvent` is enabled automatically.
