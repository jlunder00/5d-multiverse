import { describe, it, expect } from 'vitest';
import { processAction, advanceTurn, crystallizeDueWindows } from '../game-loop.js';
import { getBoardAt } from '../world-state.js';
import { createBranch } from '../branch-tree.js';
import {
  testPlugin, testTools,
  MockPieceStore,
  makeBoard, makeWorld, makeState, makeAction,
  TL, T, P, PID, RID,
} from './helpers.js';
import type { IGameDefinition, UnitTypeId } from '@5d/types';

const PIECE = 'piece' as UnitTypeId;

function makePiece(id: string, owner: string, timeline: string, turn: number, region: string) {
  return {
    state: { id: PID(id), owner: P(owner), type: PIECE, data: {} },
    coord: { timeline, turn, region: RID(region), owner: P(owner), type: PIECE, disambiguator: 0 },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** State with P1 at TL0:T1:N and P2 at TL0:T1:S (advanced to T=2), globalTurn=2. */
function twoPlayerStateAtT2() {
  const store = new MockPieceStore();
  store.initGame('test-game', [
    makePiece('piece-P1', 'P1', 'TL0', 1, 'N'),
    makePiece('piece-P2', 'P2', 'TL0', 1, 'S'),
  ]);
  store.advanceAllTimelines('test-game', [{ timeline: 'TL0', fromTurn: 1 }]);
  const board1 = makeBoard('TL0', 1);
  const board2 = makeBoard('TL0', 2);
  return makeState(makeWorld([board1, board2]), ['P1', 'P2'], 2, store);
}

/** Run P1's move_to_past to create a stabilizing branch, return resulting state. */
function stateWithStabilizingBranch() {
  const state = twoPlayerStateAtT2();
  const action = makeAction('move_to_past', 'P1',
    { timeline: 'TL0', turn: 2, region: 'N' },
    { timeline: 'TL0', turn: 1, region: 'C' },
    'piece-P1',
  );
  return processAction(state, testPlugin, testTools, action,
    { timeline: TL('TL0'), turn: T(2) }, false, undefined);
}

/** Get the in-stabilization BranchNode from state (asserts exactly one). */
function getStabilizingNode(state: ReturnType<typeof stateWithStabilizingBranch>) {
  return Object.values(state.branchTree.nodes).find((n) => n.inStabilizationPeriod)!;
}

/**
 * State where TLX is already crystallized (inStabilizationPeriod = false).
 * TL0 at T=4, TLX branched from TL0:T=1, stabilizationPeriodTurns=2.
 */
function stateWithCrystallizedBranch() {
  const store = new MockPieceStore();
  // P2 is at TL0:T=4 (used by formation-window tests)
  store.initGame('test-game', [
    makePiece('piece-P2', 'P2', 'TL0', 4, 'S'),
  ]);
  const world = makeWorld([
    makeBoard('TL0', 1),
    makeBoard('TL0', 2),
    makeBoard('TL0', 3),
    makeBoard('TL0', 4),
    makeBoard('TLX', 2),
    makeBoard('TLX', 3),
    makeBoard('TLX', 4),
  ]);
  const base = makeState(world, ['P1', 'P2'], 4, store);
  const tlxNode = {
    timelineId: TL('TLX'),
    parentTimelineId: TL('TL0'),
    divergedAtTurn: T(1),
    divergedByActionId: 'act-seed' as any,
    children: [],
    stabilizationPeriodTurns: 2,
    crystallizesAtGlobalTurn: T(4),
    inStabilizationPeriod: false,
    originAddress: { timeline: TL('TL0'), turn: T(1) },
    initiatedBy: P('P1'),
    originColumnPlayer: P('P1'),
    triggerActionId: 'act-seed' as any,
  };
  return { ...base, branchTree: createBranch(base.branchTree, tlxNode) };
}

// ---------------------------------------------------------------------------
// 1. Reject direct targeting of a stabilizing timeline
// ---------------------------------------------------------------------------

describe('processAction — stabilization enforcement', () => {
  it('rejects a same-turn lateral to a stabilizing timeline when the sender is not the parent', () => {
    const base = stateWithStabilizingBranch();
    const stabilizingNode = getStabilizingNode(base);
    const store = base.pieceStore as MockPieceStore;

    // Add P2's piece to TL1:T2 in the store
    store.addPiece('test-game',
      { id: PID('piece-P2-tl1'), owner: P('P2'), type: PIECE, data: {} },
      { timeline: 'TL1', turn: 2, region: RID('S'), owner: P('P2'), type: PIECE, disambiguator: 0 },
    );

    const tl1Board = makeBoard('TL1', 2);
    const tlxBoard2 = makeBoard(stabilizingNode.timelineId as string, 2);
    const tl1Node = {
      timelineId: TL('TL1'),
      parentTimelineId: TL('TL0'),
      divergedAtTurn: T(0),
      divergedByActionId: 'act-seed' as any,
      children: [],
      stabilizationPeriodTurns: 0,
      crystallizesAtGlobalTurn: T(0),
      inStabilizationPeriod: false,
      originAddress: null,
      initiatedBy: null,
      originColumnPlayer: null,
      triggerActionId: null,
    };
    const world2 = {
      boards: new Map([
        ...base.world.boards,
        ['TL1:2', tl1Board],
        [`${stabilizingNode.timelineId as string}:2`, tlxBoard2],
      ]),
    };
    const bt2 = createBranch(base.branchTree, tl1Node);
    const state = { ...base, world: world2, branchTree: bt2, order: { ...base.order, currentIndex: 1 } };

    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL1', turn: 2, region: 'S' },
      { timeline: stabilizingNode.timelineId as string, turn: 2, region: 'E' },
      'piece-P2-tl1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL1'), turn: T(2) }, false, undefined)
    ).toThrow(/stabiliz/i);
  });

  it('does NOT reject a subsequent arrival that targets the origin address on the parent timeline', () => {
    const state = stateWithStabilizingBranch();
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 2, region: 'S' },
      { timeline: 'TL0', turn: 1, region: 'E' },
      'piece-P2',
    );
    const state2 = { ...state, order: { ...state.order, currentIndex: 1 } };
    expect(() =>
      processAction(state2, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
    ).not.toThrow();
  });

  it('does NOT reject a direct arrival that targets the stabilizing timeline board from parent present', () => {
    const state = stateWithStabilizingBranch();
    const stabilizingNode = getStabilizingNode(state);
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 2, region: 'S' },
      { timeline: stabilizingNode.timelineId as string, turn: 1, region: 'E' },
      'piece-P2',
    );
    const state2 = { ...state, order: { ...state.order, currentIndex: 1 } };
    expect(() =>
      processAction(state2, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
    ).not.toThrow();
  });

  it('inserts the piece into the stabilizing board on direct arrival from parent', () => {
    const state = stateWithStabilizingBranch();
    const stabilizingNode = getStabilizingNode(state);
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 2, region: 'S' },
      { timeline: stabilizingNode.timelineId as string, turn: 1, region: 'E' },
      'piece-P2',
    );
    const state2 = { ...state, order: { ...state.order, currentIndex: 1 } };
    const result = processAction(state2, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const store = state.pieceStore as MockPieceStore;
    const pieces = store.getPiecesOnBoard('test-game', stabilizingNode.timelineId as string, 1);
    const arrived = pieces.find(
      (p) => (p.owner as string) === 'P2' && (p.region as string) === 'E',
    );
    expect(arrived).toBeDefined();
    // Suppress unused variable lint
    void result;
  });
});

// ---------------------------------------------------------------------------
// 2. Formation-window reachability after crystallization
// ---------------------------------------------------------------------------

describe('processAction — formation-window reachability', () => {
  function stateWithPieceOnTLX() {
    const state = stateWithCrystallizedBranch();
    const store = state.pieceStore as MockPieceStore;
    store.addPiece('test-game',
      { id: PID('piece-P1'), owner: P('P1'), type: PIECE, data: {} },
      { timeline: 'TLX', turn: 4, region: RID('N'), owner: P('P1'), type: PIECE, disambiguator: 0 },
    );
    return state;
  }

  it('rejects time travel to a formation-window turn on a crystallized branch when branchStabilizationReachable = false', () => {
    const state = stateWithPieceOnTLX();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TLX', turn: 4, region: 'N' },
      { timeline: 'TLX', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TLX'), turn: T(4) }, false, undefined)
    ).toThrow(/formation.window/i);
  });

  it('allows time travel to a formation-window turn when branchStabilizationReachable = true', () => {
    const reachablePlugin: IGameDefinition = {
      ...testPlugin,
      branchStabilizationReachable: true,
    };
    const state = stateWithPieceOnTLX();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TLX', turn: 4, region: 'N' },
      { timeline: 'TLX', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, reachablePlugin, testTools, action,
        { timeline: TL('TLX'), turn: T(4) }, false, undefined)
    ).not.toThrow();
  });

  it('allows time travel to a non-formation-window turn on a crystallized branch', () => {
    const state = stateWithCrystallizedBranch();
    const store = state.pieceStore as MockPieceStore;
    store.addPiece('test-game',
      { id: PID('piece-P1'), owner: P('P1'), type: PIECE, data: {} },
      { timeline: 'TL0', turn: 4, region: RID('N'), owner: P('P1'), type: PIECE, disambiguator: 0 },
    );

    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 4, region: 'N' },
      { timeline: 'TLX', turn: 4, region: 'C' },
      'piece-P1',
    );
    let thrownMsg = '';
    try {
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(4) }, false, undefined);
    } catch (e) {
      thrownMsg = (e as Error).message;
    }
    expect(thrownMsg).not.toMatch(/formation.window|unreachable/i);
  });

  it('rejects time travel to divergedAtTurn itself (bug #29)', () => {
    const state = stateWithPieceOnTLX();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TLX', turn: 4, region: 'N' },
      { timeline: 'TLX', turn: 1, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TLX'), turn: T(4) }, false, undefined)
    ).toThrow(/formation.window/i);
  });

  it('allows time travel to the first post-crystallization turn (bug #24)', () => {
    const state = stateWithPieceOnTLX();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TLX', turn: 4, region: 'N' },
      { timeline: 'TLX', turn: 3, region: 'C' },
      'piece-P1',
    );
    let thrownMsg = '';
    try {
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TLX'), turn: T(4) }, false, undefined);
    } catch (e) {
      thrownMsg = (e as Error).message;
    }
    expect(thrownMsg).not.toMatch(/formation.window/i);
  });
});

// ---------------------------------------------------------------------------
// 3. TL0 formation-window reachability
// ---------------------------------------------------------------------------

describe('processAction — TL0 formation-window reachability', () => {
  function stateWithTL0StabilizationHistory() {
    const store = new MockPieceStore();
    store.initGame('test-game', [
      makePiece('piece-P2', 'P2', 'TL0', 4, 'S'),
    ]);
    const world = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
      makeBoard('TL0', 4),
    ]);
    const base = makeState(world, ['P1', 'P2'], 4, store);
    const tl0Id = base.branchTree.rootTimelineId as string;
    const tl0Node = {
      ...base.branchTree.nodes[tl0Id]!,
      stabilizationPeriodTurns: 2,
      inStabilizationPeriod: false,
    };
    return {
      ...base,
      branchTree: { ...base.branchTree, nodes: { ...base.branchTree.nodes, [tl0Id]: tl0Node } },
    };
  }

  it('blocks time travel to TL0 formation-window turn when tl0StabilizationReachable = false', () => {
    const restrictedPlugin: IGameDefinition = { ...testPlugin, tl0StabilizationReachable: false };
    const state = stateWithTL0StabilizationHistory();
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 4, region: 'S' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P2',
    );
    expect(() =>
      processAction(state, restrictedPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(4) }, false, undefined)
    ).toThrow(/formation.window/i);
  });

  it('allows time travel to TL0 formation-window turn when tl0StabilizationReachable = true', () => {
    const state = stateWithTL0StabilizationHistory();
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 4, region: 'S' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P2',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(4) }, false, undefined)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Crystallization clears inStabilizationPeriod
// ---------------------------------------------------------------------------

describe('crystallizeDueWindows — timing', () => {
  it('sets inStabilizationPeriod = false on the branch node when the window closes', () => {
    const state = stateWithStabilizingBranch();
    const node = getStabilizingNode(state);
    expect(node.inStabilizationPeriod).toBe(true);

    const stateAtT4 = { ...state, order: { ...state.order, globalTurn: T(4) } };
    const crystallized = crystallizeDueWindows(
      stateAtT4, testPlugin, testTools, (s) => s, () => 'unused',
    );

    const updatedNode = crystallized.branchTree.nodes[node.timelineId as string];
    expect(updatedNode?.inStabilizationPeriod).toBe(false);
  });

  it('leaves the window open when closesAtGlobalTurn has not yet been reached', () => {
    const state = stateWithStabilizingBranch();
    const stateAtT3 = { ...state, order: { ...state.order, globalTurn: T(3) } };
    const result = crystallizeDueWindows(
      stateAtT3, testPlugin, testTools, (s) => s, () => 'unused',
    );

    const node = Object.values(result.branchTree.nodes).find((n) => n.inStabilizationPeriod);
    expect(node).toBeDefined();
    expect(node!.inStabilizationPeriod).toBe(true);
    expect(result.windows.size).toBe(1);
  });

  it('does not add or remove boards when crystallizing', () => {
    const state = stateWithStabilizingBranch();
    const node = getStabilizingNode(state);
    const boardCountBefore = state.world.boards.size;

    const stateAtT4 = { ...state, order: { ...state.order, globalTurn: T(4) } };
    const crystallized = crystallizeDueWindows(
      stateAtT4, testPlugin, testTools, (s) => s, () => 'unused',
    );

    expect(crystallized.world.boards.size).toBe(boardCountBefore);
    const stabilizingBoard = getBoardAt(crystallized.world, { timeline: node.timelineId, turn: T(1) });
    expect(stabilizingBoard).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Bug #22 — spatial moves on crystallized formation-window boards
// ---------------------------------------------------------------------------

describe('processAction — spatial move on crystallized formation-window board (bug #22)', () => {
  it('allows a spatial move on a crystallized board whose turn falls in the formation window', () => {
    const state = stateWithCrystallizedBranch();
    const store = state.pieceStore as MockPieceStore;
    store.addPiece('test-game',
      { id: PID('piece-P1'), owner: P('P1'), type: PIECE, data: {} },
      { timeline: 'TLX', turn: 2, region: RID('N'), owner: P('P1'), type: PIECE, disambiguator: 0 },
    );

    const action = makeAction('move', 'P1',
      { timeline: 'TLX', turn: 2, region: 'N' },
      { timeline: 'TLX', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TLX'), turn: T(2) }, false, undefined)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. Bug #23 — temporal+lateral moves disallowed by engine
// ---------------------------------------------------------------------------

describe('processAction — temporal+lateral prohibition (bug #23)', () => {
  it('rejects a move_to_past that crosses both timeline and turn (temporal+lateral)', () => {
    const store = new MockPieceStore();
    store.initGame('test-game', [
      makePiece('piece-P1', 'P1', 'TL-branch', 3, 'N'),
    ]);
    const world = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
      makeBoard('TL-branch', 1),
      makeBoard('TL-branch', 2),
      makeBoard('TL-branch', 3),
    ]);
    const base = makeState(world, ['P1', 'P2'], 3, store);
    const branchNode = {
      timelineId: TL('TL-branch'),
      parentTimelineId: TL('TL0'),
      divergedAtTurn: T(1),
      divergedByActionId: 'act-seed' as any,
      children: [],
      stabilizationPeriodTurns: 2,
      crystallizesAtGlobalTurn: T(4),
      inStabilizationPeriod: false,
      originAddress: { timeline: TL('TL0'), turn: T(1) },
      initiatedBy: P('P1'),
      originColumnPlayer: P('P1'),
      triggerActionId: 'act-seed' as any,
    };
    const state = { ...base, branchTree: createBranch(base.branchTree, branchNode) };

    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL-branch', turn: 3, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL-branch'), turn: T(3) }, false, undefined)
    ).toThrow(/temporal.lateral|lateral.*temporal/i);
  });

  it('still allows a same-timeline move_to_past (pure temporal move)', () => {
    const store = new MockPieceStore();
    store.initGame('test-game', [
      makePiece('piece-P1', 'P1', 'TL0', 1, 'N'),
    ]);
    // Advance T=1 → T=2 → T=3 to create history at T=1 and T=2
    store.advanceAllTimelines('test-game', [{ timeline: 'TL0', fromTurn: 1 }]);
    store.advanceAllTimelines('test-game', [{ timeline: 'TL0', fromTurn: 2 }]);
    const world2 = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
    ]);
    const state2 = makeState(world2, ['P1', 'P2'], 3, store);
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 3, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state2, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(3) }, false, undefined)
    ).not.toThrow();
  });
});
