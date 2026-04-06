# @easier-idx/connection

Similarity matrix computation, threshold selection, and pair filtering for [EASIER](https://github.com/example/easier) systems.

## Install

```bash
bun add @easier-idx/connection
```

## Usage

```typescript
import { computeSimilarityMatrix } from "@easier-idx/connection";
import { findThreshold, getPairsAboveThreshold } from "@easier-idx/connection/threshold";

// Compute pairwise cosine similarity
const matrix = computeSimilarityMatrix(setA, setB);

// Find a threshold that yields ~100 pairs
const threshold = findThreshold(matrix, 100);

// Filter to pairs above threshold
const pairs = getPairsAboveThreshold(matrix, threshold);
```

## Exports

| Export | Description |
|--------|-------------|
| `computeSimilarityMatrix` | Pairwise cosine similarity between two sets of embedding items |
| `findThreshold` | Find a similarity cutoff that yields approximately N pairs |
| `getPairsAboveThreshold` | Filter a similarity matrix to pairs at or above a threshold |

## Peer dependencies

`@easier-idx/core` is an optional peer dependency providing the `cosineSimilarity` function used internally.
