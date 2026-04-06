# @easier-idx/description

LLM-agnostic description generation and caching for [EASIER](https://github.com/example/easier) systems.

## Install

```bash
bun add @easier-idx/description
```

## Usage

```typescript
import { ensureDescription } from "@easier-idx/description";

const result = await ensureDescription(storeOps, {
  table: "documents",
  idColumn: "doc_id",
  idValue: "abc-123",
  generate: async () => ({
    description: await myLlm.summarize(text),
  }),
});

if (result.generated) {
  console.log("Generated new description:", result.description);
} else {
  console.log("Using cached description:", result.description);
}
```

## Exports

| Export | Description |
|--------|-------------|
| `ensureDescription` | Generate a description if not already cached, otherwise return the cached value |
| `findDescription` | Look up an existing cached description |
| `saveDescription` | Persist a description to the store |

## Dependencies

`@easier-idx/core` — provides `StoreOps` for database access and `TokenUsage` for tracking LLM costs.
