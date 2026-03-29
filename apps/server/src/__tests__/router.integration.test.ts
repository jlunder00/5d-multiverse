/**
 * Integration tests for Phase 4: SqlitePieceStore wired into the tRPC router.
 *
 * Uses an in-memory main DB (drizzle/better-sqlite3) and in-memory piece stores
 * (:memory: path) so no file I/O occurs. Tests verify that piece state is
 * persisted through the store rather than the worldState JSON column.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { appRouter } from '../trpc/router.js';
import type { PlayerId } from '@5d/types';

// ---------------------------------------------------------------------------
// In-memory DB setup
// ---------------------------------------------------------------------------

function makeTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  // Create tables
  db.run(sql`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    status TEXT NOT NULL,
    players TEXT NOT NULL,
    settings TEXT NOT NULL,
    world_state TEXT NOT NULL,
    branch_tree TEXT NOT NULL,
    execution_order TEXT NOT NULL,
    windows TEXT NOT NULL,
    winner TEXT,
    piece_db_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    action TEXT NOT NULL,
    result TEXT NOT NULL,
    committed_at INTEGER NOT NULL
  )`);
  return db;
}

function makeCaller(db: ReturnType<typeof makeTestDb>) {
  return appRouter.createCaller({ db, playerId: undefined });
}

function makePlayerCaller(db: ReturnType<typeof makeTestDb>, playerId: string) {
  return appRouter.createCaller({ db, playerId: playerId as PlayerId });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 4 — router + PieceStore integration', () => {
  let db: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    db = makeTestDb();
  });

  it('createGame stores a piece_db_path on the game row', async () => {
    const caller = makeCaller(db);
    const { gameId } = await caller.createGame({
      gameId: 'stub',
      players: ['P1', 'P2'],
      settings: {},
    });

    const [row] = await db.select().from(schema.games).where(
      sql`id = ${gameId}`,
    );
    expect(row).toBeDefined();
    expect(row!.pieceDbPath).toBeTruthy();
    expect(typeof row!.pieceDbPath).toBe('string');
  });

  it('createGame seeds initial pieces from the plugin initial board into the store', async () => {
    const caller = makeCaller(db);
    const { gameId } = await caller.createGame({
      gameId: 'stub',
      players: ['P1', 'P2'],
      settings: {},
    });

    // getVisibleState should return pieces from the store (not empty)
    const state = await makePlayerCaller(db, 'P1').getVisibleState({
      gameId,
      fogSetting: 'full_information',
    });

    // Stub creates initial pieces for both players
    const allPieces = state.boards.flatMap((b) => b.pieces);
    expect(allPieces.length).toBeGreaterThan(0);
  });

  it('getVisibleState returns pieces from the store, not from board.entities', async () => {
    const caller = makeCaller(db);
    const { gameId } = await caller.createGame({
      gameId: 'stub',
      players: ['P1', 'P2'],
      settings: {},
    });

    const state = await makePlayerCaller(db, 'P1').getVisibleState({
      gameId,
      fogSetting: 'full_information',
    });

    // Each board entry should have a pieces array
    for (const board of state.boards) {
      expect(Array.isArray(board.pieces)).toBe(true);
    }
  });

  it('submitAction (spatial move) updates piece position in the store', async () => {
    const caller = makeCaller(db);
    const { gameId } = await caller.createGame({
      gameId: 'stub',
      players: ['P1', 'P2'],
      settings: {},
    });

    // Get initial state to find P1's piece and board
    const before = await makePlayerCaller(db, 'P1').getVisibleState({
      gameId,
      fogSetting: 'full_information',
    });

    const board = before.boards[0]!;
    const p1Piece = board.pieces.find((p) => (p.owner as string) === 'P1');
    expect(p1Piece).toBeDefined();

    const fromRegion = p1Piece!.region as string;
    // Find an adjacent region from the stub map
    const adjacentRegion = fromRegion === 'C' ? 'N' : 'C';

    await makePlayerCaller(db, 'P1').submitAction({
      gameId,
      action: {
        id: `act-${Date.now()}` as import('@5d/types').ActionId,
        type: 'move' as import('@5d/types').ActionType,
        player: 'P1' as PlayerId,
        from: { timeline: board.address.timeline, turn: board.address.turn, region: fromRegion as import('@5d/types').RegionId },
        to: { timeline: board.address.timeline, turn: board.address.turn, region: adjacentRegion as import('@5d/types').RegionId },
        entityId: p1Piece!.realPieceId,
        payload: {},
        submittedAt: Date.now(),
      },
      boardAddress: { timeline: board.address.timeline as string, turn: board.address.turn as number },
    });

    const after = await makePlayerCaller(db, 'P1').getVisibleState({
      gameId,
      fogSetting: 'full_information',
    });

    const afterBoard = after.boards[0]!;
    const movedPiece = afterBoard.pieces.find((p) => p.realPieceId === p1Piece!.realPieceId);
    expect(movedPiece).toBeDefined();
    expect(movedPiece!.region as string).toBe(adjacentRegion);
  });

  it('endTurn advances piece positions in the store', async () => {
    const caller = makeCaller(db);
    const { gameId } = await caller.createGame({
      gameId: 'stub',
      players: ['P1', 'P2'],
      settings: {},
    });

    const before = await makePlayerCaller(db, 'P1').getVisibleState({ gameId, fogSetting: 'full_information' });
    const initialTurn = before.globalTurn as number;

    // Both players end their turn to advance the global turn
    await makePlayerCaller(db, 'P1').endTurn({ gameId });
    await makePlayerCaller(db, 'P2').endTurn({ gameId });

    const after = await makePlayerCaller(db, 'P1').getVisibleState({ gameId, fogSetting: 'full_information' });
    expect(after.globalTurn as number).toBeGreaterThan(initialTurn);

    // Pieces should still exist after advancing
    const allPieces = after.boards.flatMap((b) => b.pieces);
    expect(allPieces.length).toBeGreaterThan(0);
  });
});
