import { z } from 'zod';
import { LocationSchema } from './coordinates.js';
import { EntityIdSchema, PlayerIdSchema } from './entities.js';

export const ActionTypeSchema = z.string().brand<'ActionType'>();
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionIdSchema = z.string().brand<'ActionId'>();
export type ActionId = z.infer<typeof ActionIdSchema>;

/**
 * A single action submitted by a player for one turn.
 *
 * Movement rules (enforced by engine):
 *   - Lateral movement (same turn, different timeline) OR temporal movement
 *     (different turn within window) — never both in one action.
 *   - Branch triggers fire on committed lateral moves only.
 */
export const ActionSchema = z.object({
  id: ActionIdSchema,
  type: ActionTypeSchema,
  player: PlayerIdSchema,
  /** Where the acting entity/piece currently is. */
  from: LocationSchema,
  /** Where it is going (may be same location for in-place actions). */
  to: LocationSchema,
  /** The entity performing the action, if applicable. */
  entityId: EntityIdSchema.optional(),
  /** Game-specific payload (dice result, build type, resource exchange...). */
  payload: z.record(z.string(), z.unknown()),
  /** Wall-clock timestamp of submission. */
  submittedAt: z.number(),
});
export type Action = z.infer<typeof ActionSchema>;

export const ActionResultSchema = z.object({
  actionId: ActionIdSchema,
  success: z.boolean(),
  /** Human-readable reason for failure. */
  error: z.string().optional(),
  /** State changes produced by this action. */
  effects: z.array(z.record(z.string(), z.unknown())),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;
