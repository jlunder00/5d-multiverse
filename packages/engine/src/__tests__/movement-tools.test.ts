import { describe, it, expect } from 'vitest';
import { createMovementTools } from '../tools/movement.js';
import { createRootTimeline, crystallizeBranch } from '../branch-tree.js';
import type { RegionId, TimelineId, Turn, BranchId } from '@5d/types';
import { TL, T, RID } from './helpers.js';

const ADJACENCY: Record<string, string[]> = {
  C: ['N', 'S', 'E', 'W'],
  N: ['C'],
  S: ['C'],
  E: ['C'],
  W: ['C'],
};

const tools = createMovementTools((r) => (ADJACENCY[r as string] ?? []) as RegionId[]);

// Build a branch tree with TL0 as root, TL1 as child branching at T=2
function twoTimelineTree() {
  let tree = createRootTimeline(TL('TL0'));
  // Manually add TL1 as a crystallized branch
  const fakeBranchId = 'branch-1' as BranchId;
  tree = {
    ...tree,
    pendingBranches: {
      [fakeBranchId]: {
        id: fakeBranchId,
        originAddress: { timeline: TL('TL0'), turn: T(2) },
        triggerActionId: 'act-1' as any,
        initiatedBy: 'P1' as any,
        originColumnPlayer: 'P1' as any,
        crystallized: false,
        crystallizedTimelineId: TL('TL1'),
      },
    },
  };
  return crystallizeBranch(tree, fakeBranchId, TL('TL1'), T(4));
}

// ---------------------------------------------------------------------------
// isSpatiallyAdjacent
// ---------------------------------------------------------------------------

describe('isSpatiallyAdjacent', () => {
  it('returns true for adjacent regions', () => {
    expect(tools.isSpatiallyAdjacent(RID('N'), RID('C'))).toBe(true);
    expect(tools.isSpatiallyAdjacent(RID('C'), RID('S'))).toBe(true);
  });

  it('returns false for non-adjacent regions', () => {
    // N and S are not adjacent — only C connects them
    expect(tools.isSpatiallyAdjacent(RID('N'), RID('S'))).toBe(false);
    expect(tools.isSpatiallyAdjacent(RID('E'), RID('W'))).toBe(false);
  });

  it('returns false for a region with itself', () => {
    expect(tools.isSpatiallyAdjacent(RID('C'), RID('C'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTemporallyReachable
// ---------------------------------------------------------------------------

describe('isTemporallyReachable', () => {
  const tree = createRootTimeline(TL('TL0'));

  it('allows moving to a past turn on the same timeline (strict)', () => {
    expect(tools.isTemporallyReachable(
      { timeline: TL('TL0'), turn: T(3) },
      { timeline: TL('TL0'), turn: T(1) },
      'strict', tree,
    )).toBe(true);
  });

  it('rejects moving to the same turn', () => {
    expect(tools.isTemporallyReachable(
      { timeline: TL('TL0'), turn: T(2) },
      { timeline: TL('TL0'), turn: T(2) },
      'strict', tree,
    )).toBe(false);
  });

  it('rejects moving to a future turn (strict)', () => {
    expect(tools.isTemporallyReachable(
      { timeline: TL('TL0'), turn: T(2) },
      { timeline: TL('TL0'), turn: T(5) },
      'strict', tree,
    )).toBe(false);
  });

  it('rejects movement across timelines (temporal = same timeline only)', () => {
    const tree2 = twoTimelineTree();
    expect(tools.isTemporallyReachable(
      { timeline: TL('TL0'), turn: T(3) },
      { timeline: TL('TL1'), turn: T(1) },
      'strict', tree2,
    )).toBe(false);
  });

  it('rejects if the timeline does not exist in the tree', () => {
    expect(tools.isTemporallyReachable(
      { timeline: TL('GHOST'), turn: T(3) },
      { timeline: TL('GHOST'), turn: T(1) },
      'strict', tree,
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLaterallyReachable
// ---------------------------------------------------------------------------

describe('isLaterallyReachable', () => {
  const tree = twoTimelineTree();

  it('allows lateral move between two existing timelines at the same turn', () => {
    expect(tools.isLaterallyReachable(
      { timeline: TL('TL0'), turn: T(3) },
      { timeline: TL('TL1'), turn: T(3) },
      'strict', tree,
    )).toBe(true);
  });

  it('rejects lateral move across different turns', () => {
    expect(tools.isLaterallyReachable(
      { timeline: TL('TL0'), turn: T(3) },
      { timeline: TL('TL1'), turn: T(4) },
      'strict', tree,
    )).toBe(false);
  });

  it('rejects lateral move to the same timeline', () => {
    expect(tools.isLaterallyReachable(
      { timeline: TL('TL0'), turn: T(3) },
      { timeline: TL('TL0'), turn: T(3) },
      'strict', tree,
    )).toBe(false);
  });

  it('rejects if destination timeline does not exist in the tree', () => {
    expect(tools.isLaterallyReachable(
      { timeline: TL('TL0'), turn: T(3) },
      { timeline: TL('NONEXISTENT'), turn: T(3) },
      'strict', tree,
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeStepCounts
// ---------------------------------------------------------------------------

describe('computeStepCounts', () => {
  it('counts each step type correctly', () => {
    const counts = tools.computeStepCounts({
      steps: [
        { type: 'spatial', to: { timeline: TL('TL0'), turn: T(1), region: RID('C') } },
        { type: 'spatial', to: { timeline: TL('TL0'), turn: T(1), region: RID('N') } },
        { type: 'temporal', to: { timeline: TL('TL0'), turn: T(0) as Turn, region: RID('N') } },
        { type: 'lateral', to: { timeline: TL('TL1'), turn: T(1), region: RID('N') } },
      ],
    });
    expect(counts.spatial).toBe(2);
    expect(counts.temporal).toBe(1);
    expect(counts.lateral).toBe(1);
    expect(counts.total).toBe(4);
  });

  it('returns zeros for an empty path', () => {
    const counts = tools.computeStepCounts({ steps: [] });
    expect(counts.spatial).toBe(0);
    expect(counts.temporal).toBe(0);
    expect(counts.lateral).toBe(0);
    expect(counts.total).toBe(0);
  });
});
