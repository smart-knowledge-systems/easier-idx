# CLAUDE.md

## Required Behavior

- **Package manager:** Always use `bun` and `bunx` — never `npm`, `npx`, `yarn`, or `pnpm`
- **Git:** Never commit directly to main. Use conventional commit format: `type(scope): description`
- **Atomic commits**: One commit per logical change

## Commands

```bash
# Workspace-wide
bun run --filter '*' build           # build all packages
bun run --filter '*' check           # lint + typecheck + build all packages
bun run --filter '*' test            # test all packages

# Single package
bun run --filter '@easier-idx/core' check
bun run --filter '@easier-idx/core' test
bun run --filter '@easier-idx/logging' check
bun run --filter '@easier-idx/embedding' check
bun run --filter '@easier-idx/clustering' check

# Root scripts
bun run lint                         # ESLint all packages
bun run lint:fix                     # ESLint with auto-fix
bun run format                       # Prettier write
```

## Architecture

Monorepo with four packages:

- `packages/core` — `@easier-idx/core`: search framework (BM25/vector scoring, storage, types/interfaces, eval)
- `packages/clustering` — `@easier-idx/clustering`: k-means, kNN classify, silhouette, cluster description
- `packages/embedding` — `@easier-idx/embedding`: pluggable embedding providers and cost tracking
- `packages/logging` — `@easier-idx/logging`: structured JSON logging, correlation context, timing wrappers

Dependency graph: `@easier-idx/core` → `@easier-idx/logging`, `@easier-idx/clustering`; `@easier-idx/embedding` → `@easier-idx/logging`; `@easier-idx/clustering` peers on `@easier-idx/core`

See [README.md](README.md) for full overview.
