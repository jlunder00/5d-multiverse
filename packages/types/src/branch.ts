import { z } from 'zod';
import { BoardAddressSchema, TimelineIdSchema, TurnSchema } from './coordinates.js';
import { PlayerIdSchema } from './entities.js';
import { ActionIdSchema } from './actions.js';

export const BranchIdSchema = z.string().brand<'BranchId'>();
export type BranchId = z.infer<typeof BranchIdSchema>;

/**
 * A pending branch is a ghost of a past timestate altered by one or more
 * player actions. It accumulates arrivals during its sliding window before
 * crystallizing into a new live timeline.
 *
 * When entities arrive at a pending branch, they complete the actions of the
 * turn they were sent from — subject to plugin-defined rules (e.g. a robber
 * must move to a hex and rob; units may attack or move; Risk limits attacks
 * after a time hop). Arrival actions execute in the pending timeline's context:
 * a robber that arrives must choose a target and steal a card from that
 * player's hand in the pending timeline (the stolen card has no effect until
 * crystallization). Side effects that belong solely to the source timeline
 * (e.g. resource discards triggered by a 7-roll) do not carry over to the
 * pending board.
 *
 * After completing their arrival actions, entities are inactive. The window
 * provides arrival ordering: each arriver completes their actions against the
 * state left by all prior arrivals, then is done. No further actions occur
 * until crystallization, at which point the origin column player takes the
 * first full turn on the new live timeline.
 */
export const PendingBranchSchema = z.object({
  id: BranchIdSchema,
  /** The board address (timeline + turn) this branch originates from. */
  originAddress: BoardAddressSchema,
  /** The action that first triggered this branch. */
  triggerActionId: ActionIdSchema,
  /** Player who initiated the branch (opened the window). */
  initiatedBy: PlayerIdSchema,
  /**
   * Player whose column the origin timestate was in.
   * Takes the first turn on the new timeline after crystallization.
   */
  originColumnPlayer: PlayerIdSchema,
  crystallized: z.boolean(),
  crystallizedAtGlobalTurn: TurnSchema.optional(),
  /** ID of the new timeline created on crystallization. */
  crystallizedTimelineId: TimelineIdSchema.optional(),
});
export type PendingBranch = z.infer<typeof PendingBranchSchema>;

/**
 * A node in the multiverse branch tree.
 * Each timeline has exactly one parent except the root.
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
});
export type BranchNode = z.infer<typeof BranchNodeSchema>;

/** The full multiverse branch tree. */
export const BranchTreeSchema = z.object({
  rootTimelineId: TimelineIdSchema,
  nodes: z.record(z.string(), BranchNodeSchema),
  pendingBranches: z.record(z.string(), PendingBranchSchema),
});
export type BranchTree = z.infer<typeof BranchTreeSchema>;
