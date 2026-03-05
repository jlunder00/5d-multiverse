import { z } from 'zod';
import { BoardAddressSchema, LocationSchema, RegionIdSchema } from './coordinates.js';
import { PlayerIdSchema } from './entities.js';

// ---------------------------------------------------------------------------
// Movement modes — declared as game settings, used by plugin validators
// ---------------------------------------------------------------------------

/**
 * Whether unplayed (future) timestates are reachable as destinations or
 * transit points. Applies to both temporal and lateral movement.
 *
 * strict: only played timestates are reachable. No gaps, no futures.
 * loose:  unplayed timestates may be targeted or traversed. A unit moving
 *         to a future state leaves the present immediately (no cloning) and
 *         arrives when that state resolves, subject to its own pending window.
 */
export const AdjacencyModeSchema = z.enum(['strict', 'loose']);
export type AdjacencyMode = z.infer<typeof AdjacencyModeSchema>;

/**
 * How spatial steps and temporal/lateral steps are ordered within a single
 * unit move. Only relevant for games with spatially-moving pieces that also
 * have time-travel movement (Theater of War, Conquest). Not applicable to
 * portal-jump games (Colonist).
 *
 * staged: spatial steps and temporal/lateral steps are separate phases.
 *         The territory occupied during lateral transit is the same fixed
 *         territory across all intermediate timelines.
 * mixed:  spatial and temporal/lateral steps may be freely interleaved.
 *         The unit's spatial position at each lateral step is tracked
 *         independently per intermediate timeline.
 */
export const MovementModeSchema = z.enum(['staged', 'mixed']);
export type MovementMode = z.infer<typeof MovementModeSchema>;

// ---------------------------------------------------------------------------
// Movement path representation
// ---------------------------------------------------------------------------

/** The type of a single step in a movement path. */
export const StepTypeSchema = z.enum(['spatial', 'temporal', 'lateral']);
export type StepType = z.infer<typeof StepTypeSchema>;

/** One step in a movement path. */
export const MovementStepSchema = z.object({
  type: StepTypeSchema,
  /** The location the unit occupies after this step. */
  to: LocationSchema,
});
export type MovementStep = z.infer<typeof MovementStepSchema>;

/**
 * A fully specified movement path: an ordered sequence of steps.
 * The plugin constructs this from the player's declared move and passes it
 * to engine movement tools for reachability/traversal checks.
 *
 * Constraint (enforced by plugin, not engine): a path may not contain both
 * temporal and lateral steps — each move is purely spatial, purely temporal,
 * or purely lateral (with spatial steps allowed alongside either of the last
 * two, but not temporal and lateral combined).
 */
export const MovementSpecSchema = z.object({
  steps: z.array(MovementStepSchema),
  /** The entity performing this movement, if applicable. */
  entityId: z.string().optional(),
});
export type MovementSpec = z.infer<typeof MovementSpecSchema>;

/** Breakdown of step counts by type, returned by computeStepCounts. */
export const StepCountsSchema = z.object({
  spatial: z.number().int().nonnegative(),
  temporal: z.number().int().nonnegative(),
  lateral: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type StepCounts = z.infer<typeof StepCountsSchema>;

// ---------------------------------------------------------------------------
// Loose mode conflict resolution
// ---------------------------------------------------------------------------

/**
 * What the engine does when a loose-mode queued action becomes illegal at
 * resolution time (i.e. the future state has caught up and the action can
 * no longer legally execute).
 *
 * DESTROY:   unit/structure is lost, resources are forfeit.
 *            e.g. Conquest army arrives in enemy territory during fortify —
 *            no fortify-phase combat in Risk, so the army is simply lost.
 * REDIRECT:  unit moves to the nearest legal location instead.
 * REFUND:    action is cancelled, resources and piece are returned.
 *            e.g. Colonist building placed at a future vertex now occupied.
 * CUSTOM:    plugin provides its own resolver function.
 *
 * Note: mandatory combat on arrival (e.g. Theater of War unit committed
 * during combat movement phase arriving in enemy territory) is NOT illegal
 * action resolution — it is a legal arrival that triggers combat. That is
 * handled by IArrivalPolicy, not here.
 */
export const LooseModeConflictStrategySchema = z.enum([
  'DESTROY',
  'REDIRECT',
  'REFUND',
  'CUSTOM',
]);
export type LooseModeConflictStrategy = z.infer<typeof LooseModeConflictStrategySchema>;

/**
 * Declares how a specific action type resolves when it becomes illegal in
 * loose adjacency mode. The plugin provides one of these per action type
 * that supports loose-mode targeting.
 */
export const LooseModeConflictResolverSchema = z.object({
  actionType: z.string(),
  strategy: LooseModeConflictStrategySchema,
  /**
   * Required when strategy is CUSTOM. Called by the engine with the illegal
   * action and current world state; returns the resolved state delta.
   */
  customResolver: z
    .function()
    .args(z.unknown(), z.unknown())
    .returns(z.unknown())
    .optional(),
});
export type LooseModeConflictResolver = z.infer<typeof LooseModeConflictResolverSchema>;
