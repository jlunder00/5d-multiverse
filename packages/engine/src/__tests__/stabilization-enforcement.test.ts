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
 * Formation-window turns for TLX: T=2 and T=3.
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
  it('rejects an action whose destination timeline is currently in stabilization', () => {
    const state = stateWithStabilizingBranch();
    const stabilizingTlId = getStabilizingNode(state).timelineId as string;

    // P2 tries to move_to_past directly to the stabilizing timeline's board.
    // This is distinct from a legitimate subsequent arrival (which targets TL0:T1, not TLX).
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 2, region: 'S' },
      { timeline: stabilizingTlId, turn: 1, region: 'E' },
      'piece-P2',
    );
    // Advance to P2's turn
    const state2 = { ...state, order: { ...state.order, currentIndex: 1 } };

    expect(() =>
      processAction(state2, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
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
});

// ---------------------------------------------------------------------------
// 2. Formation-window reachability after crystallization
// ---------------------------------------------------------------------------

describe('processAction — formation-window reachability', () => {
  it('rejects time travel to a formation-window turn on a crystallized branch when branchStabilizationReachable = false', () => {
    const state = stateWithCrystallizedBranch();
    // TLX formation-window turns: T=2 and T=3 (divergedAtTurn=1, stabilizationPeriodTurns=2)
    // testPlugin has branchStabilizationReachable = false
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 4, region: 'S' },
      { timeline: 'TLX', turn: 2, region: 'C' },
      'piece-P2',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(4) }, false, undefined)
    ).toThrow(/formation.window|unreachable/i);
  });

  it('allows time travel to a formation-window turn when branchStabilizationReachable = true', () => {
    const reachablePlugin: IGameDefinition = {
      ...testPlugin,
      branchStabilizationReachable: true,
    };
    const state = stateWithCrystallizedBranch();
    const action = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 4, region: 'S' },
      { timeline: 'TLX', turn: 2, region: 'C' },
      'piece-P2',
    );
    expect(() =>
      processAction(state, reachablePlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(4) }, false, undefined)
    ).not.toThrow();
  });

  it('allows time travel to a non-formation-window turn on a crystallized branch', () => {
    // TLX:T=4 is outside the formation window (formation ends at T=3)
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
});

// ---------------------------------------------------------------------------
// 3. Crystallization clears inStabilizationPeriod
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
});
