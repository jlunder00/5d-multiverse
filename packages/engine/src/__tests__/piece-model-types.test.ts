/**
 * Type-level tests for the piece model migration (Phase 1).
 * These tests verify that:
 *  - RealPieceId, PieceInfo, PieceState, SpacetimeCoord are exported from @5d/types
 *  - PieceStore and TurnTransaction interfaces are exported from @5d/types
 *  - Board.pieces: PieceInfo[] exists (not Board.entities)
 *  - ActionContext.pieceStore exists
 *
 * All assertions are compile-time; vitest just provides the test harness.
 */
import { describe, it, expect } from 'vitest';
import { makeBoard } from './helpers.js';
import type {
  RealPieceId,
  PieceInfo,
  PieceState,
  SpacetimeCoord,
  HistoricalPieceInfo,
  PieceStore,
  TurnTransaction,
  BranchCreationParams,
  Board,
  ActionContext,
  PlayerId,
  UnitTypeId,
  RegionId,
  TimelineId,
  Turn,
} from '@5d/types';

describe('piece model types — Phase 1', () => {
  it('RealPieceId is a branded string type', () => {
    const id = 'piece-1' as RealPieceId;
    expect(typeof id).toBe('string');
  });

  it('PieceState has id, owner, type, data', () => {
    const state: PieceState = {
      id: 'piece-1' as RealPieceId,
      owner: 'P1' as PlayerId,
      type: 'infantry' as UnitTypeId,
      data: { health: 3 },
    };
    expect(state.id).toBe('piece-1');
    expect(state.owner).toBe('P1');
    expect(state.data).toEqual({ health: 3 });
  });

  it('SpacetimeCoord has timeline, turn, region, owner, type, disambiguator', () => {
    const coord: SpacetimeCoord = {
      timeline: 'TL0' as TimelineId,
      turn: 1 as Turn,
      region: 'C' as RegionId,
      owner: 'P1' as PlayerId,
      type: 'infantry' as UnitTypeId,
      disambiguator: 0,
    };
    expect(coord.disambiguator).toBe(0);
  });

  it('PieceInfo has realPieceId, owner, type, region, disambiguator, data', () => {
    const info: PieceInfo = {
      realPieceId: 'piece-1' as RealPieceId,
      owner: 'P1' as PlayerId,
      type: 'infantry' as UnitTypeId,
      region: 'C' as RegionId,
      disambiguator: 0,
      data: {},
    };
    expect(info.realPieceId).toBe('piece-1');
  });

  it('HistoricalPieceInfo has owner, type, region, disambiguator, data (no realPieceId)', () => {
    const hist: HistoricalPieceInfo = {
      owner: 'P1' as PlayerId,
      type: 'infantry' as UnitTypeId,
      region: 'N' as RegionId,
      disambiguator: 0,
      data: {},
    };
    expect(hist.owner).toBe('P1');
    // Must not have realPieceId — verified structurally: 'realPieceId' in hist must be false
    expect('realPieceId' in hist).toBe(false);
  });

  it('Board has pieces: PieceInfo[] (not entities)', () => {
    const board: Board = {
      address: { timeline: 'TL0' as TimelineId, turn: 1 as Turn },
      regions: new Map(),
      pieces: [],
      economies: new Map(),
      pluginData: {},
    };
    expect(Array.isArray(board.pieces)).toBe(true);
    // entities must not exist on Board
    expect('entities' in board).toBe(false);
  });

  it('makeBoard (helpers) creates boards with pieces not entities', () => {
    // This FAILS before Phase 1 because makeBoard sets board.entities
    // After Phase 1 + helpers update, board.pieces exists and board.entities does not
    const board = makeBoard('TL0', 1);
    expect(Array.isArray((board as any).pieces)).toBe(true);
    expect('entities' in board).toBe(false);
  });

  it('TurnTransaction has savepoint, rollbackTo, commit, rollback', () => {
    // Only a structural type check — we create a minimal implementation
    const tx: TurnTransaction = {
      savepoint(_name: string) {},
      rollbackTo(_name: string) {},
      commit() {},
      rollback() {},
    };
    expect(typeof tx.savepoint).toBe('function');
    expect(typeof tx.commit).toBe('function');
  });

  it('BranchCreationParams has all required fields', () => {
    const params: BranchCreationParams = {
      originTimeline: 'TL0',
      originTurn: 1,
      newTimelineId: 'TL1',
      travelerId: 'piece-1' as RealPieceId,
      travelerDestRegion: 'C' as RegionId,
    };
    expect(params.originTurn).toBe(1);
  });

  it('PieceStore interface is structurally sound (minimal mock compiles)', () => {
    // If PieceStore is exported and has the right shape, this mock compiles.
    const store: PieceStore = {
      getPiecesOnBoard: () => [],
      getHistoricalPieces: () => [],
      getPieceLocation: () => undefined,
      getPieceState: () => undefined,
      movePiece: () => {},
      updatePieceData: () => {},
      removePiece: () => {},
      addPiece: () => {},
      advanceAllTimelines: () => {},
      createBranch: () => {},
      beginTurn: () => ({ savepoint: () => {}, rollbackTo: () => {}, commit: () => {}, rollback: () => {} }),
      initGame: () => {},
      deleteGame: () => {},
    };
    expect(typeof store.getPiecesOnBoard).toBe('function');
  });

  it('ActionContext has pieceStore field', () => {
    // Type-only check: verify pieceStore exists on ActionContext via keyof
    type HasPieceStore = 'pieceStore' extends keyof ActionContext ? true : false;
    const check: HasPieceStore = true;
    expect(check).toBe(true);
  });
});
