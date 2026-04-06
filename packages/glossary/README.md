# @easier-idx/glossary

LLM-agnostic term extraction and caching for [EASIER](https://github.com/example/easier) systems.

## Install

```bash
bun add @easier-idx/glossary
```

## Usage

```typescript
import { ensureTerms } from "@easier-idx/glossary";

const result = await ensureTerms(storeOps, {
  table: "documents",
  idColumn: "doc_id",
  idValue: "abc-123",
  generate: async () => ({
    terms: await myLlm.extractTerms(text),
  }),
});

if (result.generated) {
  console.log("Extracted terms:", result.terms);
} else {
  console.log("Using cached terms:", result.terms);
}
```

## Exports

| Export | Description |
|--------|-------------|
| `ensureTerms` | Extract glossary terms if not already cached, otherwise return cached terms |
| `findTerms` | Look up existing cached terms |
| `saveTerms` | Persist extracted terms to the store |

## Dependencies

`@easier-idx/core` — provides `StoreOps` for database access and `TokenUsage` for tracking LLM costs.
