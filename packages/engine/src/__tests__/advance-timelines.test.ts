import { describe, it, expect } from 'vitest';
import { advanceAllTimelines } from '../game-loop.js';
import { getBoardAt } from '../world-state.js';
import { MockPieceStore, makeBoard, makeWorld, TL, T, P, PID, RID } from './helpers.js';
import type { UnitTypeId } from '@5d/types';

const PIECE = 'piece' as UnitTypeId;

describe('advanceAllTimelines', () => {
  it('creates a new board one turn ahead for the main timeline', () => {
    const world = makeWorld([makeBoard('TL0', 3)]);
    const result = advanceAllTimelines(world);
    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(4) })).toBeDefined();
  });

  it('preserves the source board as a past state', () => {
    const world = makeWorld([makeBoard('TL0', 3)]);
    const result = advanceAllTimelines(world);
    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(3) })).toBeDefined();
  });

  it('advances a ghost/pending timeline that is anchored at a past turn', () => {
    const world = makeWorld([
      makeBoard('TL0', 4),
      makeBoard('TL-branch', 1, { isPending: true }),
    ]);
    const result = advanceAllTimelines(world);

    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(5) })).toBeDefined();
    expect(getBoardAt(result, { timeline: TL('TL-branch'), turn: T(2) })).toBeDefined();
  });

  it('only advances the LATEST board per timeline, not every board', () => {
    const world = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
    ]);
    const result = advanceAllTimelines(world);

    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(4) })).toBeDefined();
    const tl0boards = [...result.boards.values()].filter(
      (b) => (b.address.timeline as string) === 'TL0',
    );
    expect(tl0boards.length).toBe(4);
  });

  it('advances multiple timelines independently in the same call', () => {
    const world = makeWorld([
      makeBoard('TL0', 5),
      makeBoard('TL1', 3),
      makeBoard('TL-ghost', 1, { isPending: true }),
    ]);
    const result = advanceAllTimelines(world);

    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(6) })).toBeDefined();
    expect(getBoardAt(result, { timeline: TL('TL1'), turn: T(4) })).toBeDefined();
    expect(getBoardAt(result, { timeline: TL('TL-ghost'), turn: T(2) })).toBeDefined();
  });

  it('advances piece positions to the next turn in the store', () => {
    const store = new MockPieceStore();
    store.initGame('test-game', [{
      state: { id: PID('piece-P1'), owner: P('P1'), type: PIECE, data: {} },
      coord: { timeline: 'TL0', turn: 1, region: RID('C'), owner: P('P1'), type: PIECE, disambiguator: 0 },
    }]);
    const world = makeWorld([makeBoard('TL0', 1)]);

    advanceAllTimelines(world, store, 'test-game');

    const pieces = store.getPiecesOnBoard('test-game', 'TL0', 2);
    const p = pieces.find((p) => p.realPieceId === PID('piece-P1'));
    expect(p).toBeDefined();
    // Region must be preserved
    expect(p!.region as string).toBe('C');
  });

  it('preserves piece region when advancing (does not reset to starting position)', () => {
    const store = new MockPieceStore();
    store.initGame('test-game', [{
      state: { id: PID('piece-P1'), owner: P('P1'), type: PIECE, data: {} },
      // piece was moved to 'S' before advance
      coord: { timeline: 'TL0', turn: 2, region: RID('S'), owner: P('P1'), type: PIECE, disambiguator: 0 },
    }]);
    const world = makeWorld([makeBoard('TL0', 2)]);

    advanceAllTimelines(world, store, 'test-game');

    const piece = store.getPieceLocation('test-game', PID('piece-P1'));
    expect(piece?.region as string).toBe('S');  // region preserved
    expect(piece?.turn).toBe(3);                 // turn updated
  });
});
