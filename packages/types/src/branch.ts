import { z } from 'zod';
import { BoardAddressSchema, TimelineIdSchema, TurnSchema } from './coordinates.js';
import { PlayerIdSchema } from './entities.js';
import { ActionIdSchema } from './actions.js';

export const BranchIdSchema = z.string().brand<'BranchId'>();
export type BranchId = z.infer<typeof BranchIdSchema>;

/**
 * A node in the multiverse branch tree.
 *
 * Each timeline has exactly one parent except the root (TL0).
 *
 * Branched timelines begin in a **stabilization period** — the first
 * `stabilizationPeriodTurns` turns are temporally unstable and cannot
 * be time-traveled to until crystallization. Crystallization is the
 * moment the timeline solidifies and normal play begins.
 *
 * Fields from the former `PendingBranch` type are merged here so that
 * all timelines are the same kind of object.
 */
export const BranchNodeSchema = z.object({
  timelineId: TimelineIdSchema,
  /** Null only for the root timeline. */
  parentTimelineId: TimelineIdSchema.nullable(),
  /** The turn at which this timeline diverged from its parent. */
  divergedAtTurn: TurnSchema.nullable(),
  /** The action that caused this divergence. */
  divergedByActionId: ActionIdSchema.nullable(),
  children: z.array(TimelineIdSchema),

  // --- Stabilization period ---

  /** Number of turns that constitute the stabilization period (= player count). */
  stabilizationPeriodTurns: z.number().int().nonnegative(),
  /**
   * The global turn at which the stabilization period ends and the
   * timeline crystallizes (becomes fully reachable per plugin settings).
   */
  crystallizesAtGlobalTurn: TurnSchema,
  /** True while the timeline is still within its stabilization period. */
  inStabilizationPeriod: z.boolean(),

  // --- Branch origin (null on root timeline) ---

  /** The board address (timeline + turn) this timeline branched from. */
  originAddress: BoardAddressSchema.nullable(),
  /** Player who initiated the branch (opened the sliding window). */
  initiatedBy: PlayerIdSchema.nullable(),
  /**
   * Player whose column the origin timestate was in.
   * Takes the first turn on this timeline after crystallization.
   */
  originColumnPlayer: PlayerIdSchema.nullable(),
  /** The action that first triggered this branch. */
  triggerActionId: ActionIdSchema.nullable(),
});
export type BranchNode = z.infer<typeof BranchNodeSchema>;

/** The full multiverse branch tree. */
export const BranchTreeSchema = z.object({
  rootTimelineId: TimelineIdSchema,
  nodes: z.record(z.string(), BranchNodeSchema),
});
export type BranchTree = z.infer<typeof BranchTreeSchema>;
