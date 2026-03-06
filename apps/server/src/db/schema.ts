import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

/**
 * One row per active game session.
 * Full game state is stored as serialized JSON in `worldState` and `branchTree`.
 * This keeps the schema simple while the data model is still evolving.
 */
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),       // plugin gameId (e.g. 'colonist')
  status: text('status').notNull(),         // 'lobby' | 'active' | 'finished'
  players: text('players').notNull(),       // JSON: PlayerId[]
  settings: text('settings').notNull(),     // JSON: Record<string, unknown>
  worldState: text('world_state').notNull(),// JSON: serialized WorldState
  branchTree: text('branch_tree').notNull(),// JSON: serialized BranchTree
  executionOrder: text('execution_order').notNull(), // JSON: ExecutionOrder
  windows: text('windows').notNull(),       // JSON: [BranchId, BranchWindow][]
  winner: text('winner'),                   // PlayerId | null
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Action log — append-only record of every committed action.
 */
export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  playerId: text('player_id').notNull(),
  action: text('action').notNull(),         // JSON: Action
  result: text('result').notNull(),         // JSON: ActionResult
  committedAt: integer('committed_at').notNull(),
});
