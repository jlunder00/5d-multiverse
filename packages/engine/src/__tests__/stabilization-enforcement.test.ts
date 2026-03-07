import { describe, it, expect } from 'vitest';
import { processAction, advanceTurn, crystallizeDueWindows } from '../game-loop.js';
import { getBoardAt } from '../world-state.js';
import { createBranch } from '../branch-tree.js';
import {
  testPlugin, testTools,
  makeBoard, makeEntity, makeWorld, makeState, makeAction,
  TL, T, P, EID,
} from './helpers.js';
import type { IGameDefinition } from '@5d/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** State with P1 at TL0:T2:N and P2 at TL0:T2:S, past board at T1 empty. */
function twoPlayerStateAtT2() {
  const e1 = makeEntity('piece-P1', 'P1', 'TL0', 2, 'N');
  const e2 = makeEntity('piece-P2', 'P2', 'TL0', 2, 'S');
  const board1 = makeBoard('TL0', 1);
  const board2 = makeBoard('TL0', 2, { entities: [e1, e2] });
  return makeState(makeWorld([board1, board2]), ['P1', 'P2'], 2);
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
 * Manually build a state where TLX is already crystallized (inStabilizationPeriod = false).
 * TL0 at T=4, TLX branched from TL0:T=1, stabilizationPeriodTurns=2.
 * Formation-window turns for TLX: T=2 only (divergedAtTurn+1..divergedAtTurn+stabilizationPeriodTurns-1).
 */
function stateWithCrystallizedBranch() {
  const e2 = makeEntity('piece-P2', 'P2', 'TL0', 4, 'S');
  const world = makeWorld([
    makeBoard('TL0', 1),
    makeBoard('TL0', 2),
    makeBoard('TL0', 3),
    makeBoard('TL0', 4, { entities: [e2] }),
    makeBoard('TLX', 2),
    makeBoard('TLX', 3),
    makeBoard('TLX', 4),
  ]);
  const base = makeState(world, ['P1', 'P2'], 4);
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
    // TLX (child of TL0) is in stabilization. TL1 is an unrelated timeline.
    // A lateral move TL1:T2 → TLX:T2 (same turn, different timeline) from a non-parent
    // must be rejected — only TL0 (TLX's parent) can send pieces to TLX during stabilization.
    const base = stateWithStabilizingBranch();
    const stabilizingNode = getStabilizingNode(base);

    // Add TL1 as a sibling timeline with a piece for P2 at T2, and add TLX:T2 board
    const e2 = makeEntity('piece-P2', 'P2', 'TL1', 2, 'S');
    const tl1Board = makeBoard('TL1', 2, { entities: [e2] });
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

    // Lateral move: TL1:T2 → TLX:T2 (same turn, different timeline, TL1 is not TLX's parent)
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL1', turn: 2, region: 'S' },
      { timeline: stabilizingNode.timelineId as string, turn: 2, region: 'E' },
      'piece-P2',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL1'), turn: T(2) }, false, undefined)
    ).toThrow(/stabiliz/i);
  });

  it('does NOT reject a subsequent arrival that targets the origin address on the parent timeline', () => {
    // P2 sends to TL0:T1 (origin address) — this is a valid subsequent arrival.
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
    // P2 sends directly to TLX:T1 (the stabilizing timeline's first board).
    // This is a subsequent arrival via direct addressing — should be allowed.
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

  it('inserts the entity into the stabilizing board on direct arrival from parent', () => {
    // Verifies the entity actually lands — not just that the action doesn't throw.
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

    const destBoard = getBoardAt(result.world, { timeline: stabilizingNode.timelineId, turn: T(1) });
    const arrived = [...(destBoard?.entities.values() ?? [])].find(
      (e) => e.owner === 'P2' && (e.location.region as string) === 'E',
    );
    expect(arrived).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Formation-window reachability after crystallization
// ---------------------------------------------------------------------------

describe('processAction — formation-window reachability', () => {
  /** Add P1 on TLX:T4 so we can do a same-timeline temporal move to a formation-window turn. */
  function stateWithPieceOnTLX() {
    const state = stateWithCrystallizedBranch();
    const e1 = makeEntity('piece-P1', 'P1', 'TLX', 4, 'N');
    const board = getBoardAt(state.world, { timeline: TL('TLX'), turn: T(4) })!;
    const updatedWorld = {
      ...state.world,
      boards: new Map(state.world.boards).set('TLX:4', { ...board, entities: new Map([[EID('piece-P1'), e1]]) }),
    };
    return { ...state, world: updatedWorld };
  }

  it('rejects time travel to a formation-window turn on a crystallized branch when branchStabilizationReachable = false', () => {
    // P1 on TLX:T4 travels to TLX:T2 — same timeline, pure temporal.
    // TLX formation-window turns: T2 only (divergedAtTurn=1, stabilizationPeriodTurns=2 → window is T2..T2).
    // testPlugin has branchStabilizationReachable = false → reject.
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
    // Same path as above, but plugin allows formation-window turns.
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
    // TLX:T=4 is outside the formation window (formation ends at T=2 after fix #24)
    const state = stateWithCrystallizedBranch();
    const e1 = makeEntity('piece-P1', 'P1', 'TL0', 4, 'N');
    const board = getBoardAt(state.world, { timeline: TL('TL0'), turn: T(4) })!;
    const newBoard = { ...board, entities: new Map([[EID('piece-P1'), e1]]) };
    const updatedWorld = { ...state.world, boards: new Map(state.world.boards).set('TL0:4', newBoard) };
    const stateWithP1 = { ...state, world: updatedWorld };

    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 4, region: 'N' },
      { timeline: 'TLX', turn: 4, region: 'C' },
      'piece-P1',
    );
    // TLX:T=4 is beyond the formation window — should be allowed (or at least not blocked
    // by formation-window reachability; other errors like "destination must be past" may fire)
    // The key assertion: no formation-window error
    let thrownMsg = '';
    try {
      processAction(stateWithP1, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(4) }, false, undefined);
    } catch (e) {
      thrownMsg = (e as Error).message;
    }
    expect(thrownMsg).not.toMatch(/formation.window|unreachable/i);
  });

  it('allows time travel to the first post-crystallization turn (bug #24)', () => {
    // divergedAtTurn=1, stabilizationPeriodTurns=2 → correct formation window is T2 only.
    // T3 is the first board created AFTER crystallization and must be reachable.
    // The buggy formula incorrectly includes T3 in the formation window.
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
  /** TL0 at T=4, crystallized but with stabilizationPeriodTurns=2 (turns 1-2 are formation window). */
  function stateWithTL0StabilizationHistory() {
    const e2 = makeEntity('piece-P2', 'P2', 'TL0', 4, 'S');
    const world = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
      makeBoard('TL0', 4, { entities: [e2] }),
    ]);
    const base = makeState(world, ['P1', 'P2'], 4);
    // Override TL0 node: crystallized, but formation-window turns 1–2 recorded
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
    // testPlugin has tl0StabilizationReachable = true
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
    // Build a state with a branch in stabilization and a window closing NOW
    const state = stateWithStabilizingBranch();
    const node = getStabilizingNode(state);
    expect(node.inStabilizationPeriod).toBe(true);

    // The window closes at globalTurn = openedAt + nPlayers = 2 + 2 = 4.
    // Fast-forward globalTurn to 4 and call crystallizeDueWindows.
    const stateAtT4 = { ...state, order: { ...state.order, globalTurn: T(4) } };
    const crystallized = crystallizeDueWindows(
      stateAtT4, testPlugin, testTools, (s) => s, () => 'unused',
    );

    const updatedNode = crystallized.branchTree.nodes[node.timelineId as string];
    expect(updatedNode?.inStabilizationPeriod).toBe(false);
  });

  it('leaves the window open when closesAtGlobalTurn has not yet been reached', () => {
    const state = stateWithStabilizingBranch();
    // Window closes at globalTurn=4; we are at globalTurn=3
    const stateAtT3 = { ...state, order: { ...state.order, globalTurn: T(3) } };
    const result = crystallizeDueWindows(
      stateAtT3, testPlugin, testTools, (s) => s, () => 'unused',
    );

    const node = getStabilizingNode(result);
    expect(node).toBeDefined();
    expect(node.inStabilizationPeriod).toBe(true);
    expect(result.windows.size).toBe(1);
  });

  it('does not add or remove boards when crystallizing', () => {
    // Ensures the old catch-up loop is gone: crystallization is metadata-only.
    const state = stateWithStabilizingBranch();
    const node = getStabilizingNode(state);
    const boardCountBefore = state.world.boards.size;

    const stateAtT4 = { ...state, order: { ...state.order, globalTurn: T(4) } };
    const crystallized = crystallizeDueWindows(
      stateAtT4, testPlugin, testTools, (s) => s, () => 'unused',
    );

    expect(crystallized.world.boards.size).toBe(boardCountBefore);
    // Stabilizing board must still be present at its original turn
    const stabilizingBoard = getBoardAt(crystallized.world, { timeline: node.timelineId, turn: T(1) });
    expect(stabilizingBoard).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Bug #22 — spatial moves on crystallized formation-window boards
// ---------------------------------------------------------------------------

describe('processAction — spatial move on crystallized formation-window board (bug #22)', () => {
  it('allows a spatial move on a crystallized board whose turn falls in the formation window', () => {
    // TLX: crystallized, divergedAtTurn=1, stabilizationPeriodTurns=2 → formation window T2..T3.
    // A spatial move submitted on TLX:T2 has action.to.turn=2 — inside the window.
    // This must NOT be blocked by the formation-window reachability check.
    const e1 = makeEntity('piece-P1', 'P1', 'TLX', 2, 'N');
    const state = stateWithCrystallizedBranch();
    const board = getBoardAt(state.world, { timeline: TL('TLX'), turn: T(2) })!;
    const updatedWorld = {
      ...state.world,
      boards: new Map(state.world.boards).set('TLX:2', { ...board, entities: new Map([[EID('piece-P1'), e1]]) }),
    };
    const stateWithPiece = { ...state, world: updatedWorld };

    const action = makeAction('move', 'P1',
      { timeline: 'TLX', turn: 2, region: 'N' },
      { timeline: 'TLX', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(stateWithPiece, testPlugin, testTools, action,
        { timeline: TL('TLX'), turn: T(2) }, false, undefined)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. Bug #23 — temporal+lateral moves disallowed by engine
// ---------------------------------------------------------------------------

describe('processAction — temporal+lateral prohibition (bug #23)', () => {
  it('rejects a move_to_past that crosses both timeline and turn (temporal+lateral)', () => {
    // Piece on TL-branch:T3 tries to go to TL0:T1 — different timeline AND different turn.
    // This is temporal+lateral, which the engine must block.
    const e1 = makeEntity('piece-P1', 'P1', 'TL-branch', 3, 'N');
    const world = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
      makeBoard('TL-branch', 1),
      makeBoard('TL-branch', 2),
      makeBoard('TL-branch', 3, { entities: [e1] }),
    ]);
    const base = makeState(world, ['P1', 'P2'], 3);
    // TL-branch is crystallized (inStabilizationPeriod=false), parent=TL0
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
    // From TL-branch:T3 to TL-branch:T1 — same timeline, past turn → allowed.
    const e1 = makeEntity('piece-P1', 'P1', 'TL-branch', 3, 'N');
    const world = makeWorld([
      makeBoard('TL-branch', 1),
      makeBoard('TL-branch', 2),
      makeBoard('TL-branch', 3, { entities: [e1] }),
    ]);
    const base = makeState(world, ['P1', 'P2'], 3);
    const state = base; // no branch node needed — TL-branch not in tree, but TL0 is root

    // Use TL0 directly to keep test simple: TL0:T3 → TL0:T1
    const e2 = makeEntity('piece-P1', 'P1', 'TL0', 3, 'N');
    const world2 = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3, { entities: [e2] }),
    ]);
    const state2 = makeState(world2, ['P1', 'P2'], 3);
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
