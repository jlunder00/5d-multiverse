import { z } from 'zod';
import { TimelineIdSchema, TurnSchema } from './coordinates.js';

/**
 * Sliding window configuration.
 *
 * mode "n":   players may act only on the current global turn.
 * mode "n+1": players may also act on the next turn (response turn),
 *             but response actions are restricted to branch augmentation only.
 *
 * Default: "n+1" (Theater of War default per design).
 */
export const WindowModeSchema = z.enum(['n', 'n+1']);
export type WindowMode = z.infer<typeof WindowModeSchema>;

/** Per-timeline sliding window state. */
export const TimelineWindowSchema = z.object({
  timelineId: TimelineIdSchema,
  /** The earliest turn still open for action in this timeline. */
  minActiveTurn: TurnSchema,
  /** The latest turn open for action (minActiveTurn + window size - 1). */
  maxActiveTurn: TurnSchema,
  mode: WindowModeSchema,
});
export type TimelineWindow = z.infer<typeof TimelineWindowSchema>;

/** Global execution order state for one global turn. */
export const ExecutionOrderSchema = z.object({
  globalTurn: TurnSchema,
  /**
   * Player IDs in priority order for this global turn.
   * Rotates by one position each global turn (n-position rotation).
   */
  priorityQueue: z.array(z.string()),
  /** Index of the player whose turn it currently is. */
  currentIndex: z.number().int().nonneg(),
});
export type ExecutionOrder = z.infer<typeof ExecutionOrderSchema>;
