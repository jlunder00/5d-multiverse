# 5D Multiverse

A game-agnostic 5D multiverse time travel board game engine, with plugins for three games:

- **5D Colonist** — Catan-like
- **5D Conquest** — Risk-like
- **5D Theater of War** — Axis & Allies-like

## How it works

Pieces move across a (timeline, turn, region) coordinate space. Lateral moves — crossing timelines — branch the multiverse, creating pending boards that crystallize as the game progresses. Players act in a rotating priority order across all active timelines simultaneously.

## Monorepo structure

```
packages/
  types/     # @5d/types   — shared TypeScript types
  engine/    # @5d/engine  — core multiverse logic
  colonist/  # @5d/colonist — Colonist game plugin
  conquest/  # @5d/conquest — Conquest game plugin
  theater/   # @5d/theater  — Theater of War game plugin
apps/
  server/    # Fastify + tRPC API server
  client/    # React + Vite frontend
rulesets/    # Game ruleset documents
docs/        # Engine API documentation
```

## Tech stack

- **Runtime**: Node.js + TypeScript
- **Monorepo**: pnpm workspaces + Turborepo
- **Server**: Fastify, tRPC, Zod, Drizzle ORM (SQLite)
- **Client**: React, Vite, TailwindCSS, tRPC client

## Status

Work in progress.
