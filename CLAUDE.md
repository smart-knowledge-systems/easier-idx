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

See [README.md](README.md) for architecture overview, design principles, and usage examples.
