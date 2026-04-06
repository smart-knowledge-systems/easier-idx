# @easier-idx/batch

Anthropic Batch API lifecycle management for [EASIER](https://github.com/example/easier) systems.

## Install

```bash
bun add @easier-idx/batch
```

## Usage

```typescript
import { submitBatch, pollBatch, iterateResults } from "@easier-idx/batch";

// Submit a batch
const { batchId } = await submitBatch(client, requests);

// Poll until done
const { done, counts } = await pollBatch(client, batchId);

// Iterate results
for await (const result of iterateResults(client, batchId)) {
  if (result.ok) {
    console.log(result.value);
  }
}
```

## Exports

| Export | Description |
|--------|-------------|
| `submitBatch` | Submit a batch of requests to the Anthropic API |
| `pollBatch` / `pollBatches` | Poll one or many batches for completion status |
| `iterateResults` | Async-iterate over batch results with typed success/error variants |
| `casUpdate` / `detectOrphans` | Re-exported from `@easier-idx/core` for CAS-based cache management |

## Peer dependencies

- `@anthropic-ai/sdk` (optional) — required at runtime for batch operations
- `@easier-idx/core` — cache utilities and shared types
