# CLAUDE.md

## Required Behavior

- **Package manager:** Always use `bun` and `bunx` — never `npm`, `npx`, `yarn`, or `pnpm`
- **Git:** Never commit directly to main. Use conventional commit format: `type(scope): description`
- **Atomic commits**: One commit per logical change

## Commands

```bash
bun run check            # lint + typecheck combined
bun run format           # Prettier write
bun run lint:fix         # ESLint with auto-fix
bun test                 # Run tests
```

## Architecture

EASIER = Embedding-Augmented Semantic Index for Efficient Retrieval

This is a framework for building semantic search indexes where:
- Retrieval is the terminal operation (no RAG, no generation)
- Index stores embeddings of metadata/structural descriptors, not verbatim content
- The consumer (human or agent) decides what to do with ranked results

Domain projects implement `Collector<TMeta>` and `DocumentStore<TMeta>` interfaces.
The framework provides embedding, storage, scoring, config, cost tracking, and CLI utilities.
