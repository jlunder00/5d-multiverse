import { describe, it, expect } from 'vitest';
import { advanceAllTimelines } from '../game-loop.js';
import { getBoardAt } from '../world-state.js';
import { makeBoard, makeEntity, makeWorld, TL, T } from './helpers.js';

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
    // Main timeline is at T=4. Ghost was created at T=1.
    // Both should get a new board at their respective turn+1.
    const world = makeWorld([
      makeBoard('TL0', 4),
      makeBoard('TL-branch', 1, { isPending: true }),
    ]);
    const result = advanceAllTimelines(world);

    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(5) })).toBeDefined();
    expect(getBoardAt(result, { timeline: TL('TL-branch'), turn: T(2) })).toBeDefined();
  });

  it('only advances the LATEST board per timeline, not every board', () => {
    // TL0 has T=1, T=2, T=3. Only T=3 (latest) should spawn T=4.
    const world = makeWorld([
      makeBoard('TL0', 1),
      makeBoard('TL0', 2),
      makeBoard('TL0', 3),
    ]);
    const result = advanceAllTimelines(world);

    expect(getBoardAt(result, { timeline: TL('TL0'), turn: T(4) })).toBeDefined();
    // T=2 and T=1 should NOT have produced T=3-copy or T=2-copy
    const tl0boards = [...result.boards.values()].filter(
      (b) => (b.address.timeline as string) === 'TL0',
    );
    // 4 boards: original T1, T2, T3, and the new T4
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

  it('carries entity positions forward to the next board', () => {
    const entity = makeEntity('piece-P1', 'P1', 'TL0', 3, 'C');
    const world = makeWorld([makeBoard('TL0', 3, { entities: [entity] })]);
    const result = advanceAllTimelines(world);

    const nextBoard = getBoardAt(result, { timeline: TL('TL0'), turn: T(4) });
    expect(nextBoard).toBeDefined();
    const advancedEntity = nextBoard!.entities.get('piece-P1' as any);
    expect(advancedEntity).toBeDefined();
    // Entity region must be preserved
    expect(advancedEntity!.location.region as string).toBe('C');
    // Entity turn must be updated
    expect(advancedEntity!.location.turn as number).toBe(4);
  });

  it('updates entity turn but NOT entity region when advancing', () => {
    // Regression: advancing boards must not reset entities to their starting positions
    const entity = makeEntity('piece-P1', 'P1', 'TL0', 2, 'S'); // piece was moved to S
    const world = makeWorld([makeBoard('TL0', 2, { entities: [entity] })]);
    const result = advanceAllTimelines(world);

    const nextBoard = getBoardAt(result, { timeline: TL('TL0'), turn: T(3) });
    const e = nextBoard?.entities.get('piece-P1' as any);
    expect(e?.location.region as string).toBe('S');   // region preserved
    expect(e?.location.turn as number).toBe(3);        // turn updated
  });
});
