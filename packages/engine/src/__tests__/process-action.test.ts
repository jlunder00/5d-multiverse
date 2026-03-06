import { describe, it, expect } from 'vitest';
import { processAction, advanceAllTimelines } from '../game-loop.js';
import { getBoardAt } from '../world-state.js';
import {
  testPlugin, testTools,
  makeBoard, makeEntity, makeWorld, makeState, makeAction,
  TL, T, EID,
} from './helpers.js';

// Helper: build a state with P1 holding a piece at region 'N' on TL0:T1
function stateWithPieceAtN() {
  const entity = makeEntity('piece-P1', 'P1', 'TL0', 1, 'N');
  const board = makeBoard('TL0', 1, { entities: [entity] });
  const world = makeWorld([board]);
  return makeState(world, ['P1', 'P2'], 1);
}

// Helper: build a state with a piece at T=2 (present) and an empty board at T=1 (past)
function stateForTimeTravelFrom2To1() {
  const entity = makeEntity('piece-P1', 'P1', 'TL0', 2, 'N');
  const pastBoard = makeBoard('TL0', 1);
  const presentBoard = makeBoard('TL0', 2, { entities: [entity] });
  const world = makeWorld([pastBoard, presentBoard]);
  return makeState(world, ['P1', 'P2'], 2);
}

// ---------------------------------------------------------------------------
// Spatial move ('move')
// ---------------------------------------------------------------------------

describe('processAction — spatial move', () => {
  it('moves the entity to the destination region on the board', () => {
    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(1) }, false, undefined);

    const board = getBoardAt(next.world, { timeline: TL('TL0'), turn: T(1) });
    const entity = board?.entities.get(EID('piece-P1'));
    expect(entity).toBeDefined();
    expect(entity!.location.region as string).toBe('C');
  });

  it('does NOT leave the entity at the source region after moving', () => {
    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(1) }, false, undefined);

    const board = getBoardAt(next.world, { timeline: TL('TL0'), turn: T(1) });
    const entity = board?.entities.get(EID('piece-P1'));
    // Entity still exists (move, not remove) — but its region must be the destination
    expect(entity!.location.region as string).not.toBe('N');
  });

  it('rejects a move to a non-adjacent region', () => {
    const state = stateWithPieceAtN();
    // N and S are not adjacent (only C connects them)
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

  it('rejects a move when the entity is not on the submitted board', () => {
    // Entity is on T=1 but we submit against T=2 (no entity there)
    const entity = makeEntity('piece-P1', 'P1', 'TL0', 1, 'N');
    const board1 = makeBoard('TL0', 1, { entities: [entity] });
    const board2 = makeBoard('TL0', 2); // entity NOT here
    const world = makeWorld([board1, board2]);
    const state = makeState(world, ['P1'], 2);

    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 2, region: 'C' },
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
    ).toThrow(/entity not found/i);
  });

  it('preserves entity region through advance after a move', () => {
    // Move piece N→C at T=1, then advance timelines — T=2 board should have piece at C

    const state = stateWithPieceAtN();
    const action = makeAction('move', 'P1',
      { timeline: 'TL0', turn: 1, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const movedState = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(1) }, false, undefined);

    const advancedWorld = advanceAllTimelines(movedState.world);
    const nextBoard = getBoardAt(advancedWorld, { timeline: TL('TL0'), turn: T(2) });
    const entity = nextBoard?.entities.get(EID('piece-P1'));

    expect(entity).toBeDefined();
    expect(entity!.location.region as string).toBe('C'); // not reset to 'N'
    expect(entity!.location.turn as number).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Time travel ('move_to_past')
// ---------------------------------------------------------------------------

describe('processAction — move_to_past', () => {
  it('removes the entity from the source (present) board', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const sourceBoard = getBoardAt(next.world, { timeline: TL('TL0'), turn: T(2) });
    expect(sourceBoard?.entities.has(EID('piece-P1'))).toBe(false);
  });

  it('creates a ghost (pending) board at the destination turn', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const ghostBoards = [...next.world.boards.values()].filter(
      (b) => b.pluginData?.['isPendingBranch'] === true,
    );
    expect(ghostBoards.length).toBe(1);
  });

  it('places the entity on the ghost board at the destination region', () => {
    const state = stateForTimeTravelFrom2To1();
    const action = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const next = processAction(state, testPlugin, testTools, action,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const ghostBoard = [...next.world.boards.values()].find(
      (b) => b.pluginData?.['isPendingBranch'] === true,
    )!;
    const entity = ghostBoard.entities.get(EID('piece-P1'));
    expect(entity).toBeDefined();
    expect(entity!.location.region as string).toBe('C');
  });

  it('opens a sliding window for the new pending branch', () => {
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
      { timeline: 'TL0', turn: 2, region: 'C' }, // same turn — not past
      'piece-P1',
    );
    expect(() =>
      processAction(state, testPlugin, testTools, action,
        { timeline: TL('TL0'), turn: T(2) }, false, undefined)
    ).toThrow(/past turn/i);
  });

  it('adds a second entity to an existing ghost board instead of creating a new branch', () => {
    // P1 sends piece-P1 to T=1. Then P2 also sends piece-P2 to T=1.
    // Should result in 1 ghost board, not 2.
    const e1 = makeEntity('piece-P1', 'P1', 'TL0', 2, 'N');
    const e2 = makeEntity('piece-P2', 'P2', 'TL0', 2, 'S');
    const board1 = makeBoard('TL0', 1);
    const board2 = makeBoard('TL0', 2, { entities: [e1, e2] });
    const world = makeWorld([board1, board2]);
    const state = makeState(world, ['P1', 'P2'], 2);

    const action1 = makeAction('move_to_past', 'P1',
      { timeline: 'TL0', turn: 2, region: 'N' },
      { timeline: 'TL0', turn: 1, region: 'C' },
      'piece-P1',
    );
    const state2 = processAction(state, testPlugin, testTools, action1,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    // Advance to P2's turn
    const state3 = { ...state2, order: { ...state2.order, currentIndex: 1 } };
    const action2 = makeAction('move_to_past', 'P2',
      { timeline: 'TL0', turn: 2, region: 'S' },
      { timeline: 'TL0', turn: 1, region: 'E' },
      'piece-P2',
    );
    const state4 = processAction(state3, testPlugin, testTools, action2,
      { timeline: TL('TL0'), turn: T(2) }, false, undefined);

    const ghostBoards = [...state4.world.boards.values()].filter(
      (b) => b.pluginData?.['isPendingBranch'] === true,
    );
    expect(ghostBoards.length).toBe(1);
    expect(ghostBoards[0]!.entities.has(EID('piece-P1'))).toBe(true);
    expect(ghostBoards[0]!.entities.has(EID('piece-P2'))).toBe(true);
  });
});
