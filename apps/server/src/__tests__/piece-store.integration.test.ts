/**
 * Integration tests for SqlitePieceStore.
 *
 * Each test uses an in-memory SQLite DB (no file I/O).
 * Tests run the full PieceStore interface: init, query, mutate,
 * advance timelines, create branch, undo via savepoint, delete.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { PieceState, SpacetimeCoord, PieceInfo } from '@5d/types';
import { SqlitePieceStore } from '../piece-store/sqlite-adapter.js';

// Helpers
function pid(s: string) { return s as PieceState['id']; }
function owner(s: string) { return s as PieceState['owner']; }
function unitType(s: string) { return s as PieceState['type']; }
function regionId(s: string) { return s as SpacetimeCoord['region']; }

function makeState(id: string, o = 'player1', t = 'infantry'): PieceState {
  return { id: pid(id), owner: owner(o), type: unitType(t), data: {} };
}

function makeCoord(
  timeline: string,
  turn: number,
  region: string,
  o = 'player1',
  t = 'infantry',
  disambiguator = 0,
): SpacetimeCoord {
  return {
    timeline,
    turn,
    region: regionId(region),
    owner: owner(o),
    type: unitType(t),
    disambiguator,
  };
}

const GAME = 'game-test';

describe('SqlitePieceStore', () => {
  let store: SqlitePieceStore;

  beforeEach(() => {
    // In-memory DB — no file cleanup needed
    store = new SqlitePieceStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // ── initGame ───────────────────────────────────────────────────────────────

  describe('initGame', () => {
    it('initialises a game with pieces visible on the starting board', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
        { state: makeState('p2', 'player2', 'cavalry'), coord: makeCoord('TL0', 1, 'R2', 'player2', 'cavalry') },
      ]);

      const pieces = store.getPiecesOnBoard(GAME, 'TL0', 1);
      expect(pieces).toHaveLength(2);

      const p1 = pieces.find(p => p.realPieceId === 'p1');
      expect(p1).toBeDefined();
      expect(p1!.owner).toBe('player1');
      expect(p1!.type).toBe('infantry');
      expect(p1!.region).toBe('R1');
      expect(p1!.disambiguator).toBe(0);
    });

    it('registers piece locations so getPieceLocation works', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const loc = store.getPieceLocation(GAME, pid('p1'));
      expect(loc).toBeDefined();
      expect(loc!.timeline).toBe('TL0');
      expect(loc!.turn).toBe(1);
      expect(loc!.region).toBe('R1');
    });

    it('returns empty array for board with no pieces', () => {
      store.initGame(GAME, []);
      const pieces = store.getPiecesOnBoard(GAME, 'TL0', 1);
      expect(pieces).toHaveLength(0);
    });
  });

  // ── getPieceState ──────────────────────────────────────────────────────────

  describe('getPieceState', () => {
    it('returns the piece state by realPieceId', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const state = store.getPieceState(GAME, pid('p1'));
      expect(state).toBeDefined();
      expect(state!.id).toBe('p1');
      expect(state!.owner).toBe('player1');
      expect(state!.type).toBe('infantry');
      expect(state!.data).toEqual({});
    });

    it('returns undefined for unknown piece', () => {
      store.initGame(GAME, []);
      expect(store.getPieceState(GAME, pid('unknown'))).toBeUndefined();
    });
  });

  // ── movePiece ──────────────────────────────────────────────────────────────

  describe('movePiece', () => {
    it('moves a piece to a new region within the same board', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const tx = store.beginTurn(GAME);
      store.movePiece(GAME, pid('p1'), { region: regionId('R2') });
      tx.commit();

      const loc = store.getPieceLocation(GAME, pid('p1'));
      expect(loc!.region).toBe('R2');

      const pieces = store.getPiecesOnBoard(GAME, 'TL0', 1);
      const p1 = pieces.find(p => p.realPieceId === 'p1');
      expect(p1!.region).toBe('R2');
    });
  });

  // ── updatePieceData ────────────────────────────────────────────────────────

  describe('updatePieceData', () => {
    it('merges data into the piece state', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const tx = store.beginTurn(GAME);
      store.updatePieceData(GAME, pid('p1'), { movesUsed: 1, hp: 3 });
      tx.commit();

      const state = store.getPieceState(GAME, pid('p1'));
      expect(state!.data).toEqual({ movesUsed: 1, hp: 3 });
    });
  });

  // ── removePiece ────────────────────────────────────────────────────────────

  describe('removePiece', () => {
    it('removes a piece from the board and piece_locations', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const tx = store.beginTurn(GAME);
      store.removePiece(GAME, pid('p1'));
      tx.commit();

      expect(store.getPiecesOnBoard(GAME, 'TL0', 1)).toHaveLength(0);
      expect(store.getPieceLocation(GAME, pid('p1'))).toBeUndefined();
    });
  });

  // ── addPiece ───────────────────────────────────────────────────────────────

  describe('addPiece', () => {
    it('adds a new piece onto a board mid-turn', () => {
      store.initGame(GAME, []);

      const tx = store.beginTurn(GAME);
      store.addPiece(
        GAME,
        makeState('p_new', 'player2', 'cannon'),
        makeCoord('TL0', 1, 'R3', 'player2', 'cannon'),
      );
      tx.commit();

      const pieces = store.getPiecesOnBoard(GAME, 'TL0', 1);
      expect(pieces).toHaveLength(1);
      expect(pieces[0].realPieceId).toBe('p_new');
      expect(pieces[0].type).toBe('cannon');
    });
  });

  // ── Undo via savepoint ─────────────────────────────────────────────────────

  describe('savepoint / rollback undo', () => {
    it('rolling back a savepoint reverses a move', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const tx = store.beginTurn(GAME);
      tx.savepoint('a1');
      store.movePiece(GAME, pid('p1'), { region: regionId('R2') });

      // Before rollback: piece is at R2
      expect(store.getPieceLocation(GAME, pid('p1'))!.region).toBe('R2');

      tx.rollbackTo('a1');

      // After rollback: piece is back at R1
      expect(store.getPieceLocation(GAME, pid('p1'))!.region).toBe('R1');
      tx.commit();
    });

    it('rolling back does not undo prior committed savepoints', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
        { state: makeState('p2', 'player2', 'cavalry'), coord: makeCoord('TL0', 1, 'R4', 'player2', 'cavalry') },
      ]);

      const tx = store.beginTurn(GAME);

      // Action 1: move p1 to R2
      tx.savepoint('a1');
      store.movePiece(GAME, pid('p1'), { region: regionId('R2') });

      // Action 2: move p2 to R5
      tx.savepoint('a2');
      store.movePiece(GAME, pid('p2'), { region: regionId('R5') });

      // Undo action 2 only
      tx.rollbackTo('a2');
      expect(store.getPieceLocation(GAME, pid('p2'))!.region).toBe('R4');
      // p1's move remains
      expect(store.getPieceLocation(GAME, pid('p1'))!.region).toBe('R2');

      tx.commit();
    });

    it('rolling back outer transaction reverses all mutations', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      const tx = store.beginTurn(GAME);
      store.movePiece(GAME, pid('p1'), { region: regionId('R9') });
      tx.rollback();

      expect(store.getPieceLocation(GAME, pid('p1'))!.region).toBe('R1');
    });
  });

  // ── advanceAllTimelines ────────────────────────────────────────────────────

  describe('advanceAllTimelines', () => {
    it('writes historical snapshots and bumps turn for all timelines', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
        { state: makeState('p2', 'player2', 'cavalry'), coord: makeCoord('TL0', 1, 'R2', 'player2', 'cavalry') },
      ]);

      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      // New present board is at turn 2
      const present = store.getPiecesOnBoard(GAME, 'TL0', 2);
      expect(present).toHaveLength(2);

      // Historical snapshot preserved for turn 1
      const historical = store.getHistoricalPieces(GAME, 'TL0', 1);
      expect(historical).toHaveLength(2);

      // piece_locations updated to turn 2
      const loc = store.getPieceLocation(GAME, pid('p1'));
      expect(loc!.turn).toBe(2);
    });

    it('disambiguators are compacted on advance', () => {
      // Two pieces same (tl, turn, region, owner, type) → disambiguators 0 and 1
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1', 'player1', 'infantry', 0) },
        { state: makeState('p2'), coord: makeCoord('TL0', 1, 'R1', 'player1', 'infantry', 1) },
      ]);

      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      const present = store.getPiecesOnBoard(GAME, 'TL0', 2);
      expect(present).toHaveLength(2);
      const disambiguators = present.map(p => p.disambiguator).sort();
      expect(disambiguators).toEqual([0, 1]);
    });
  });

  // ── createBranch ──────────────────────────────────────────────────────────

  describe('createBranch', () => {
    it('bootstraps a new timeline from historical snapshots', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
        { state: makeState('p2', 'player2', 'cavalry'), coord: makeCoord('TL0', 1, 'R2', 'player2', 'cavalry') },
      ]);

      // Advance so there's a historical snapshot at turn 1
      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      // p1 travels back to TL0 turn 1, branching into TL1
      store.createBranch(GAME, {
        originTimeline: 'TL0',
        originTurn: 1,
        newTimelineId: 'TL1',
        travelerId: pid('p1'),
        travelerDestRegion: regionId('R3'),
      });

      // New timeline should have bootstrapped copies of TL0 turn 1 pieces
      // plus the traveler placed in R3
      const newBoard = store.getPiecesOnBoard(GAME, 'TL1', 1);
      // p1 (traveler) is in R3; p2's copy is in R2 (bootstrapped)
      expect(newBoard).toHaveLength(2);

      const traveler = newBoard.find(p => p.realPieceId === 'p1');
      expect(traveler).toBeDefined();
      expect(traveler!.region).toBe('R3');

      // Bootstrapped copy of p2 has a NEW realPieceId (not 'p2')
      const copy = newBoard.find(p => p.realPieceId !== 'p1');
      expect(copy).toBeDefined();
      expect(copy!.realPieceId).not.toBe('p2');
      expect(copy!.type).toBe('cavalry');
      expect(copy!.region).toBe('R2');
    });

    it('traveler keeps its original realPieceId on the new timeline', () => {
      store.initGame(GAME, [
        { state: makeState('traveler'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      store.createBranch(GAME, {
        originTimeline: 'TL0',
        originTurn: 1,
        newTimelineId: 'TL1',
        travelerId: pid('traveler'),
        travelerDestRegion: regionId('R5'),
      });

      const newBoard = store.getPiecesOnBoard(GAME, 'TL1', 1);
      expect(newBoard.some(p => p.realPieceId === 'traveler')).toBe(true);
    });

    it('traveler is removed from source board after branch creation', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
        { state: makeState('p2', 'player2', 'cavalry'), coord: makeCoord('TL0', 1, 'R2', 'player2', 'cavalry') },
      ]);
      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      store.createBranch(GAME, {
        originTimeline: 'TL0',
        originTurn: 1,
        newTimelineId: 'TL1',
        travelerId: pid('p1'),
        travelerDestRegion: regionId('R3'),
      });

      // p1 should no longer be on TL0 turn 2 (it left)
      const sourcePieces = store.getPiecesOnBoard(GAME, 'TL0', 2);
      expect(sourcePieces.find(p => p.realPieceId === 'p1')).toBeUndefined();
    });
  });

  // ── SqliteTurnTransaction state ────────────────────────────────────────────

  describe('SqliteTurnTransaction state guards', () => {
    it('commit() a second time throws', () => {
      store.initGame(GAME, []);
      const tx = store.beginTurn(GAME);
      tx.commit();
      expect(() => tx.commit()).toThrow();
    });

    it('rollback() a second time throws', () => {
      store.initGame(GAME, []);
      const tx = store.beginTurn(GAME);
      tx.rollback();
      expect(() => tx.rollback()).toThrow();
    });

    it('[Symbol.dispose] auto-rolls back an open transaction', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);
      store.movePiece(GAME, pid('p1'), { region: regionId('R9') });
      // Simulate `using` keyword by calling [Symbol.dispose] directly
      (tx as unknown as { [Symbol.dispose](): void })[Symbol.dispose]();
      expect(store.getPieceLocation(GAME, pid('p1'))!.region).toBe('R1');
    });
  });

  // ── deleteGame ─────────────────────────────────────────────────────────────

  describe('deleteGame', () => {
    it('removes all data for the game', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      store.deleteGame(GAME);

      expect(store.getPiecesOnBoard(GAME, 'TL0', 1)).toHaveLength(0);
      expect(store.getPieceLocation(GAME, pid('p1'))).toBeUndefined();
    });
  });

  // ── getPiecesOnBoard data via JOIN ──────────────────────────────────────────

  describe('getPiecesOnBoard non-empty data', () => {
    it('returns correct data fields for pieces with non-empty data', () => {
      store.initGame(GAME, [
        { state: { ...makeState('p1'), data: { hp: 10, attack: 3 } }, coord: makeCoord('TL0', 1, 'R1') },
        { state: { ...makeState('p2', 'player2', 'cavalry'), data: { moves: 2 } }, coord: makeCoord('TL0', 1, 'R2', 'player2', 'cavalry') },
        { state: { ...makeState('p3'), data: { hp: 5 } }, coord: makeCoord('TL0', 1, 'R3') },
      ]);
      const pieces = store.getPiecesOnBoard(GAME, 'TL0', 1);
      expect(pieces).toHaveLength(3);
      expect(pieces.find(p => p.realPieceId === 'p1')!.data).toEqual({ hp: 10, attack: 3 });
      expect(pieces.find(p => p.realPieceId === 'p2')!.data).toEqual({ moves: 2 });
      expect(pieces.find(p => p.realPieceId === 'p3')!.data).toEqual({ hp: 5 });
    });
  });

  // ── movePiece timeline support ──────────────────────────────────────────────

  describe('movePiece — timeline move', () => {
    it('moves a piece to a new timeline and is visible on that board', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);
      store.movePiece(GAME, pid('p1'), { timeline: 'TL1' });
      tx.commit();

      const pieces = store.getPiecesOnBoard(GAME, 'TL1', 1);
      expect(pieces.find(p => p.realPieceId === 'p1')).toBeDefined();

      // Piece is absent from source board
      expect(store.getPiecesOnBoard(GAME, 'TL0', 1)).toHaveLength(0);

      const loc = store.getPieceLocation(GAME, pid('p1'));
      expect(loc!.timeline).toBe('TL1');
    });
  });

  // ── movePiece turn support ──────────────────────────────────────────────────

  describe('movePiece — turn move', () => {
    it('moves a piece to a different turn number', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);
      store.movePiece(GAME, pid('p1'), { turn: 3 });
      tx.commit();

      expect(store.getPiecesOnBoard(GAME, 'TL0', 3)).toHaveLength(1);
      expect(store.getPiecesOnBoard(GAME, 'TL0', 1)).toHaveLength(0);
      expect(store.getPieceLocation(GAME, pid('p1'))!.turn).toBe(3);
    });
  });

  // ── movePiece error paths ───────────────────────────────────────────────────

  describe('movePiece — error paths', () => {
    it('throws when newCoord has no fields set', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);
      expect(() => store.movePiece(GAME, pid('p1'), {})).toThrow();
      tx.rollback();
    });
  });

  // ── removePiece error paths ────────────────────────────────────────────────

  describe('removePiece — error paths', () => {
    it('throws when piece is not in present_positions', () => {
      store.initGame(GAME, []);
      const tx = store.beginTurn(GAME);
      expect(() => store.removePiece(GAME, pid('nonexistent'))).toThrow();
      tx.rollback();
    });
  });

  // ── removePiece keeps pieces row ───────────────────────────────────────────

  describe('removePiece — pieces row retention', () => {
    it('getPieceState still returns the piece state after removal (historical record)', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);
      store.removePiece(GAME, pid('p1'));
      tx.commit();

      expect(store.getPieceState(GAME, pid('p1'))).toBeDefined();
    });
  });

  // ── updatePieceData merge ───────────────────────────────────────────────────

  describe('updatePieceData merge semantics', () => {
    it('existing fields not overwritten by absent keys', () => {
      store.initGame(GAME, [
        { state: { ...makeState('p1'), data: { hp: 3 } }, coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);
      store.updatePieceData(GAME, pid('p1'), { movesUsed: 1 });
      tx.commit();

      const state = store.getPieceState(GAME, pid('p1'));
      expect(state!.data).toEqual({ hp: 3, movesUsed: 1 });
    });
  });

  // ── createBranch guards ────────────────────────────────────────────────────

  describe('createBranch — precondition guards', () => {
    it('throws when there are no historical snapshots at the origin board', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      // No advanceAllTimelines — no snapshot exists
      expect(() => store.createBranch(GAME, {
        originTimeline: 'TL0',
        originTurn: 1,
        newTimelineId: 'TL1',
        travelerId: pid('p1'),
        travelerDestRegion: regionId('R3'),
      })).toThrow();
    });

    it('traveler getPieceLocation returns new timeline after branch creation', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      store.createBranch(GAME, {
        originTimeline: 'TL0',
        originTurn: 1,
        newTimelineId: 'TL1',
        travelerId: pid('p1'),
        travelerDestRegion: regionId('R3'),
      });

      const loc = store.getPieceLocation(GAME, pid('p1'));
      expect(loc!.timeline).toBe('TL1');
      expect(loc!.region).toBe('R3');
    });
  });

  // ── savepoint name validation ──────────────────────────────────────────────

  describe('savepoint — name validation', () => {
    it('throws for savepoint names containing hyphens or spaces', () => {
      store.initGame(GAME, []);
      const tx = store.beginTurn(GAME);
      expect(() => tx.savepoint('bad-name')).toThrow();
      expect(() => tx.savepoint('bad name')).toThrow();
      tx.rollback();
    });

    it('throws for rollbackTo names with non-word characters', () => {
      store.initGame(GAME, []);
      const tx = store.beginTurn(GAME);
      tx.savepoint('valid');
      expect(() => tx.rollbackTo('bad-name')).toThrow();
      tx.rollback();
    });
  });

  // ── advanceAllTimelines: multiple timelines ────────────────────────────────

  describe('advanceAllTimelines — multiple timelines', () => {
    it('advances two timelines atomically in one call', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
        { state: makeState('p2', 'player2', 'cavalry'), coord: makeCoord('TL1', 1, 'R2', 'player2', 'cavalry') },
      ]);

      store.advanceAllTimelines(GAME, [
        { timeline: 'TL0', fromTurn: 1 },
        { timeline: 'TL1', fromTurn: 1 },
      ]);

      expect(store.getPiecesOnBoard(GAME, 'TL0', 2)).toHaveLength(1);
      expect(store.getPiecesOnBoard(GAME, 'TL1', 2)).toHaveLength(1);
      expect(store.getHistoricalPieces(GAME, 'TL0', 1)).toHaveLength(1);
      expect(store.getHistoricalPieces(GAME, 'TL1', 1)).toHaveLength(1);
    });
  });

  // ── deleteGame clears historical snapshots ─────────────────────────────────

  describe('deleteGame — full cleanup', () => {
    it('clears historical_snapshots in addition to present positions', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);
      expect(store.getHistoricalPieces(GAME, 'TL0', 1)).toHaveLength(1);

      store.deleteGame(GAME);

      expect(store.getHistoricalPieces(GAME, 'TL0', 1)).toHaveLength(0);
    });
  });

  // ── disambiguator compaction with gap ──────────────────────────────────────

  describe('advanceAllTimelines — disambiguator gap compaction', () => {
    it('compacts disambiguators when piece dis=0 was removed leaving a gap', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1', 'player1', 'infantry', 0) },
        { state: makeState('p2'), coord: makeCoord('TL0', 1, 'R1', 'player1', 'infantry', 1) },
      ]);

      const tx = store.beginTurn(GAME);
      store.removePiece(GAME, pid('p1')); // removes dis=0; dis=1 survivor
      tx.commit();

      store.advanceAllTimelines(GAME, [{ timeline: 'TL0', fromTurn: 1 }]);

      const present = store.getPiecesOnBoard(GAME, 'TL0', 2);
      expect(present).toHaveLength(1);
      expect(present[0]!.disambiguator).toBe(0); // compacted from 1 → 0
    });
  });

  // ── savepoint: continue after rollback ─────────────────────────────────────

  describe('savepoint — continue after rollback', () => {
    it('can make new moves after rolling back a savepoint', () => {
      store.initGame(GAME, [
        { state: makeState('p1'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      const tx = store.beginTurn(GAME);

      tx.savepoint('sp1');
      store.movePiece(GAME, pid('p1'), { region: regionId('R2') });
      tx.rollbackTo('sp1');

      // Move to a different region after rollback
      store.movePiece(GAME, pid('p1'), { region: regionId('R3') });
      tx.commit();

      expect(store.getPieceLocation(GAME, pid('p1'))!.region).toBe('R3');
    });
  });

  // ── multiple games isolation ────────────────────────────────────────────────

  describe('multi-game isolation', () => {
    it('pieces from different games do not bleed across', () => {
      store.initGame('game-A', [
        { state: makeState('pA'), coord: makeCoord('TL0', 1, 'R1') },
      ]);
      store.initGame('game-B', [
        { state: makeState('pB'), coord: makeCoord('TL0', 1, 'R1') },
      ]);

      expect(store.getPiecesOnBoard('game-A', 'TL0', 1).map(p => p.realPieceId)).toEqual(['pA']);
      expect(store.getPiecesOnBoard('game-B', 'TL0', 1).map(p => p.realPieceId)).toEqual(['pB']);
    });
  });
});
