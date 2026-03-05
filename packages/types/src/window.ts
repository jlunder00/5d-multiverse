import { z } from 'zod';
import { BoardAddressSchema, TurnSchema } from './coordinates.js';
import { PlayerIdSchema } from './entities.js';
import { BranchIdSchema } from './branch.js';

/**
 * Window mode per pending branch.
 *
 * "n":     pure — window runs exactly n turns (one full round).
 *          Crystallizes on the initiator's next turn with no bonus.
 *          Default for Colonist.
 *
 * "n+0.5": window runs n turns, then before crystallization fires the
 *          initiator gets a half-action. The engine tracks which boards
 *          are in scope and ensures no turn is counted as having passed.
 *          What actions are legal during the half-action is defined by
 *          the game plugin (via IActionValidator with context.isHalfAction).
 *          Default for Conquest and Theater of War.
 */
export const WindowModeSchema = z.enum(['n', 'n+0.5']);
export type WindowMode = z.infer<typeof WindowModeSchema>;

/**
 * Sliding window state for one pending branch.
 *
 * Each pending branch has its own independent window.
 * The window is always n turns long (one full round).
 *
 * - Opens on the initiating player's turn.
 * - Closes on the initiating player's next turn.
 * - At close, the branch crystallizes (after half-action in n+0.5 mode).
 * - The first turn on the new timeline belongs to the origin column player.
 */
export const BranchWindowSchema = z.object({
  branchId: BranchIdSchema,
  mode: WindowModeSchema,
  /** Player who opened the window. */
  initiator: PlayerIdSchema,
  /** Global turn number on which the window opened. */
  openedAtGlobalTurn: TurnSchema,
  /** Global turn number on which the window will close (= openedAtGlobalTurn + n). */
  closesAtGlobalTurn: TurnSchema,
  /**
   * Player whose column the origin timestate was in.
   * Takes the first turn on the new timeline after crystallization.
   */
  originColumnPlayer: PlayerIdSchema,
  /**
   * In n+0.5 mode: the boards the half-action may affect.
   * Includes the pending board and the initiator's source boards — only
   * the boards that actually sent units/actions to initiate this branch,
   * across all timelines the initiator acted in on that turn.
   * Determined at window-open time and fixed thereafter.
   * Empty in pure n mode.
   */
  halfActionBoards: z.array(BoardAddressSchema),
  /**
   * In n+0.5 mode: whether the initiator has already used their half-action.
   * The engine does not advance the turn counter during the half-action.
   * Irrelevant in pure n mode.
   */
  halfActionUsed: z.boolean(),
});
export type BranchWindow = z.infer<typeof BranchWindowSchema>;

/** Global execution order state for one global turn. */
export const ExecutionOrderSchema = z.object({
  globalTurn: TurnSchema,
  /**
   * Player IDs in priority order for this global turn.
   * Rotates by one position each global turn.
   */
  priorityQueue: z.array(PlayerIdSchema),
  /** Index of the player whose turn it currently is. */
  currentIndex: z.number().int().nonneg(),
});
export type ExecutionOrder = z.infer<typeof ExecutionOrderSchema>;
