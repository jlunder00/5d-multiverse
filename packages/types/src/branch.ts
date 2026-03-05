import { z } from 'zod';
import { BoardAddressSchema, TimelineIdSchema, TurnSchema } from './coordinates.js';
import { PlayerIdSchema } from './entities.js';
import { ActionIdSchema } from './actions.js';

export const BranchIdSchema = z.string().brand<'BranchId'>();
export type BranchId = z.infer<typeof BranchIdSchema>;

/**
 * A pending branch is a frozen snapshot of a board that was created when a
 * player made a lateral move into a timeline that had not yet been played to
 * that turn. It waits until the timeline's sliding window reaches that turn,
 * at which point it crystallizes into a live board.
 *
 * For Colonist: always frozen until crystallization.
 * For Conquest/Theater: may be partially live (limited-live mode).
 */
export const PendingBranchSchema = z.object({
  id: BranchIdSchema,
  /** The board address this branch is waiting to crystallize at. */
  address: BoardAddressSchema,
  /** The action that triggered this branch. */
  triggerActionId: ActionIdSchema,
  /** Which player caused the branch. */
  triggeredBy: PlayerIdSchema,
  /** When the pending branch was created (global turn). */
  createdAtTurn: TurnSchema,
  /** Crystallized = promoted to live board. */
  crystallized: z.boolean(),
  crystallizedAtTurn: TurnSchema.optional(),
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
