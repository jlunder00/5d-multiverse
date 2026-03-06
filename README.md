# 5D Multiverse

A game-agnostic 5D multiverse time travel board game engine, with plugins for three games:

- **5D Colonist** — Catan-like
- **5D Conquest** — Risk-like
- **5D Theater of War** — Axis & Allies-like

A fourth game, **5D Warzone** (simultaneous secret order submission, Risk-like), is planned as a future plugin.

## How it works

Every game state lives at a coordinate: `(Timeline ID, Turn Number, Region)`. Games start with a single timeline. New timelines are created only by player actions — building in the past, committing units to a past timestate, or landing a cross-timeline attack that modifies history. Any such action creates a **pending branch** that accumulates contributions from all players over one full round before crystallizing into a new live timeline.

The engine supports two turn ordering models: **sequential with rotating priority** (current three games) and **simultaneous secret submission** (planned Warzone/Diplomacy plugins). Conflicts in sequential games are prevented by ordering, not resolved by special rules — when you arrive at a pending board, earlier arrivals are already there and normal game legality handles the rest.

The engine core is thin by design. It owns multiverse state, sliding windows, execution order, the information model, and fog of war, and ships reusable tools (dice infrastructure, movement legality, branch-tree traversal) that plugins call into. Plugins wire those tools together with game-specific rules. See [`docs/ENGINE_DESIGN.md`](docs/ENGINE_DESIGN.md) for the full spec.

## Monorepo structure

```
packages/
  types/     # @5d/types    — shared TypeScript types
  engine/    # @5d/engine   — core multiverse logic + reusable tools
  colonist/  # @5d/colonist — Colonist game plugin
  conquest/  # @5d/conquest — Conquest game plugin
  theater/   # @5d/theater  — Theater of War game plugin
apps/
  server/    # Fastify + tRPC API server
  client/    # React + Vite frontend
rulesets/    # Game ruleset documents
docs/        # Engine design specification and API documentation
```

## Tech stack

- **Runtime**: Node.js + TypeScript
- **Monorepo**: pnpm workspaces + Turborepo
- **Server**: Fastify, tRPC, Zod, Drizzle ORM (SQLite)
- **Client**: React, Vite, TailwindCSS, tRPC client

## Status

Work in progress.
