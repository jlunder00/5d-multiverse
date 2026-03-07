/**
 * Failing tests for #14 — stabilization period types.
 *
 * These tests describe the NEW type shapes that will exist after the refactor:
 *  - BranchNode carries stabilization period metadata (no separate PendingBranch)
 *  - BranchTree has no pendingBranches record
 *  - WorldState has no pendingBranches map
 *  - IGameDefinition has tl0StabilizationReachable / branchStabilizationReachable
 *
 * They fail against the current types and pass after the refactor.
 */
import { describe, it, expect } from 'vitest';
import { BranchNodeSchema, BranchTreeSchema } from '@5d/types';
import { testPlugin } from './helpers.js';

// ---------------------------------------------------------------------------
// BranchNode — stabilization fields must be present after parsing
// ---------------------------------------------------------------------------

describe('BranchNode schema — stabilization period fields', () => {
  it('parses stabilizationPeriodTurns on a branch node', () => {
    const raw = {
      timelineId: 'TL1',
      parentTimelineId: 'TL0',
      divergedAtTurn: 2,
      divergedByActionId: 'act-1',
      children: [],
      stabilizationPeriodTurns: 3,
      crystallizesAtGlobalTurn: 5,
      inStabilizationPeriod: true,
      originAddress: { timeline: 'TL0', turn: 2 },
      initiatedBy: 'player1',
      originColumnPlayer: 'player1',
      triggerActionId: 'act-1',
    };
    const result = BranchNodeSchema.parse(raw);
    expect(result.stabilizationPeriodTurns).toBe(3);
    expect(result.crystallizesAtGlobalTurn).toBe(5);
    expect(result.inStabilizationPeriod).toBe(true);
    expect(result.originAddress).toEqual({ timeline: 'TL0', turn: 2 });
    expect(result.initiatedBy).toBe('player1');
    expect(result.originColumnPlayer).toBe('player1');
    expect(result.triggerActionId).toBe('act-1');
  });

  it('parses root timeline node (all branch-specific fields null)', () => {
    const raw = {
      timelineId: 'TL0',
      parentTimelineId: null,
      divergedAtTurn: null,
      divergedByActionId: null,
      children: [],
      stabilizationPeriodTurns: 2,
      crystallizesAtGlobalTurn: 2,
      inStabilizationPeriod: false,
      originAddress: null,
      initiatedBy: null,
      originColumnPlayer: null,
      triggerActionId: null,
    };
    const result = BranchNodeSchema.parse(raw);
    expect(result.stabilizationPeriodTurns).toBe(2);
    expect(result.inStabilizationPeriod).toBe(false);
    expect(result.originAddress).toBeNull();
    expect(result.initiatedBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BranchTree — no pendingBranches field
// ---------------------------------------------------------------------------

describe('BranchTree schema — no pendingBranches', () => {
  it('parses a branch tree without pendingBranches', () => {
    const raw = {
      rootTimelineId: 'TL0',
      nodes: {
        TL0: {
          timelineId: 'TL0',
          parentTimelineId: null,
          divergedAtTurn: null,
          divergedByActionId: null,
          children: [],
          stabilizationPeriodTurns: 2,
          crystallizesAtGlobalTurn: 2,
          inStabilizationPeriod: false,
          originAddress: null,
          initiatedBy: null,
          originColumnPlayer: null,
          triggerActionId: null,
        },
      },
    };
    const result = BranchTreeSchema.parse(raw);
    expect(result.rootTimelineId).toBe('TL0');
    // pendingBranches must NOT be a required field in the new schema
    expect((result as Record<string, unknown>)['pendingBranches']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// IGameDefinition — stabilization reachability settings
// ---------------------------------------------------------------------------

describe('IGameDefinition — stabilization reachability settings', () => {
  it('testPlugin has tl0StabilizationReachable defined', () => {
    expect(typeof (testPlugin as Record<string, unknown>)['tl0StabilizationReachable']).toBe('boolean');
  });

  it('testPlugin has branchStabilizationReachable defined', () => {
    expect(typeof (testPlugin as Record<string, unknown>)['branchStabilizationReachable']).toBe('boolean');
  });
});
