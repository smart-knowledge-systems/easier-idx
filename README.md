# EASIER Monorepo

**E**mbedding-**A**ugmented **S**emantic **I**ndex for **E**fficient **R**etrieval.

## Packages

| Package | Description |
|---------|-------------|
| [`@easier/core`](packages/core/) | Search framework with hybrid BM25/vector scoring, pluggable storage, clustering, and eval |
| [`@easier/clustering`](packages/clustering/) | K-means clustering, kNN classification, silhouette scoring, and cluster description |
| [`@easier/embedding`](packages/embedding/) | Pluggable embedding providers (OpenAI, Ollama, remote) and cost tracking |
| [`@easier/logging`](packages/logging/) | Structured JSON logging with correlation context and timing wrappers |

## Development

```bash
bun install                          # install all workspace dependencies
bun run --filter '*' build           # build all packages
bun run --filter '*' check           # lint + typecheck + build all packages
bun run --filter '*' test            # test all packages
bun run --filter '@easier/core' test # test a specific package
```

## License

MIT
