import { describe, it, expect } from 'vitest';
import { processAction, advanceAllTimelines } from '../game-loop.js';
import { getBoardAt } from '../world-state.js';
import {
  testPlugin, testTools,
  MockPieceStore,
  makeBoard, makeWorld, makeState, makeAction,
  TL, T, P, PID, RID,
} from './helpers.js';
import type { UnitTypeId } from '@5d/types';

const PIECE = 'piece' as UnitTypeId;

function makePiece(id: string, owner: string, timeline: string, turn: number, region: string) {
  return {
    state: { id: PID(id), owner: P(owner), type: PIECE, data: {} },
    coord: { timeline, turn, region: RID(region), owner: P(owner), type: PIECE, disambiguator: 0 },
  };
}

// Helper: state with P1 holding a piece at region 'N' on TL0:T1
function stateWithPieceAtN() {
  const store = new MockPieceStore();
  store.initGame('test-game', [makePiece('piece-P1', 'P1', 'TL0', 1, 'N')]);
  const board = makeBoard('TL0', 1);
  const world = makeWorld([board]);
  return makeState(world, ['P1', 'P2'], 1, store);
}

// Helper: piece at T=1, advance to T=2 (creates history at T=1), then set up state at T=2
function stateForTimeTravelFrom2To1() {
  const store = new MockPieceStore();
  store.initGame('test-game', [makePiece('piece-P1', 'P1', 'TL0', 1, 'N')]);
  store.advanceAllTimelines('test-game', [{ timeline: 'TL0', fromTurn: 1 }]);
  const pastBoard = makeBoard('TL0', 1);
  const presentBoard = makeBoard('TL0', 2);
  const world = makeWorld([pastBoard, presentBoard]);
  return makeState(world, ['P1', 'P2'], 2, store);
}

// Returns all timelines in stabilization period from branchTree nodes
function stabilizationTimelines(state: ReturnType<typeof makeState>) {
  return Object.values(state.branchTree.nodes).filter((n) => n.inStabilizationPeriod);
}

// ---------------------------------------------------------------------------
// Spatial move ('move')
// ---------------------------------------------------------------------------

describe('processAction — spatial move', () => {
  it('moves the piece to the destination region in the store', () => {
    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(1) }, false, undefined);

    const store = state.pieceStore as MockPieceStore;
    const pieces = store.getPiecesOnBoard('test-game', 'TL0', 1);
    const p = pieces.find((p) => p.realPieceId === PID('piece-P1'));
    expect(p).toBeDefined();
    expect(p!.region as string).toBe('C');
  });

  it('does NOT leave the piece at the source region after moving', () => {
    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(1) }, false, undefined);

    const store = state.pieceStore as MockPieceStore;
    const pieces = store.getPiecesOnBoard('test-game', 'TL0', 1);
    const p = pieces.find((p) => p.realPieceId === PID('piece-P1'));
    expect(p!.region as string).not.toBe('N');
  });

  it('rejects a move to a non-adjacent region', () => {
    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'S' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(1) }, false, undefined)
    ).toThrow(/adjacent/i);
  });

  it('rejects a move when the piece is not on the submitted board', () => {
    const store = new MockPieceStore();
    // Piece is at T=1 but action is submitted for T=2
    store.initGame('test-game', [makePiece('piece-P1', 'P1', 'TL0', 1, 'N')]);
    const board1 = makeBoard('TL0', 1);
    const board2 = makeBoard('TL0', 2);
    const world = makeWorld([board1, board2]);
    const state = makeState(world, ['P1'], 2, store);

    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
    ).toThrow(/piece not found/i);
  });

  it('preserves piece region through advance after a move', () => {
    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const movedState = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(1) }, false, undefined);

    const store = state.pieceStore as MockPieceStore;
    advanceAllTimelines(movedState.world, store, 'test-game');

    const piece = store.getPieceLocation('test-game', PID('piece-P1'));
    expect(piece?.region as string).toBe('C');
    expect(piece?.turn).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Time travel ('move_to_past')
// ---------------------------------------------------------------------------

describe('processAction — move_to_past', () => {
  it('removes the piece from the source (present) board in the store', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const store = state.pieceStore as MockPieceStore;
    const sourcePieces = store.getPiecesOnBoard('test-game', 'TL0', 2);
    expect(sourcePieces.find((p) => p.realPieceId === PID('piece-P1'))).toBeUndefined();
  });

  it('creates a new in-stabilization timeline at the destination', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const inWindow = stabilizationTimelines(next);
    expect(inWindow.length).toBe(1);
  });

  it('places the traveler on the stabilization board at the destination region', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const [node] = stabilizationTimelines(next);
    const store = state.pieceStore as MockPieceStore;
    const pieces = store.getPiecesOnBoard('test-game', node!.timelineId as string, 1);
    const arrived = pieces.find((p) => (p.owner as string) === 'P1' && (p.region as string) === 'C');
    expect(arrived).toBeDefined();
  });

  it('new timeline board is placed at originAddress.turn (not +1)', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const [node] = stabilizationTimelines(next);
    const newBoard = getBoardAt(next.world, { timeline: node!.timelineId, turn: T(1) });
    expect(newBoard).toBeDefined();
    expect(newBoard!.address.turn as number).toBe(1);
  });

  it('opens a sliding window for the new branch', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    expect(next.windows.size).toBe(1);
  });

  it('rejects moving to the same or a future turn', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
    ).toThrow(/past turn/i);
  });

  it('does not create a second branch when a subsequent arrival occurs', () => {
    // P1 sends piece-P1 to T=1. Then P2 also sends piece-P2 to T=1.
    // Should result in exactly 1 in-stabilization timeline (not 2).
    const store = new MockPieceStore();
    store.initGame('test-game', [
      makePiece('piece-P1', 'P1', 'TL0', 1, 'N'),
      makePiece('piece-P2', 'P2', 'TL0', 1, 'S'),
    ]);
    store.advanceAllTimelines('test-game', [{ timeline: 'TL0', fromTurn: 1 }]);
    const board1 = makeBoard('TL0', 1);
    const board2 = makeBoard('TL0', 2);
    const world = makeWorld([board1, board2]);
    const state = makeState(world, ['P1', 'P2'], 2, store);

    const action1 = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const state2 = processAction(state, testPlugin, testTools, action1,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const state3 = { ...state2, order: { ...state2.order, currentIndex: 1 } };
    const action2 = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 2, region: 'S' },
      { timeline: 'TL0', turn: 1, region: 'E' },
      'piece-P2',
    );
    const state4 = processAction(state3, testPlugin, testTools, action2,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    // Still exactly 1 in-stabilization timeline
    expect(stabilizationTimelines(state4).length).toBe(1);
    // Still only 1 window (same branch)
    expect(state4.windows.size).toBe(1);
  });
});
