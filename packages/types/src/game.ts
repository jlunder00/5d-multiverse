import { z } from 'zod';
import { Location, BoardAddress, RegionId } from './coordinates.js';
import { Entity, EntityId, RegionState, Economy, PlayerId } from './entities.js';
import { Action, ActionResult } from './actions.js';
import { BranchId, PendingBranch } from './branch.js';
import { WindowMode } from './window.js';
import { AdjacencyMode, MovementMode, LooseModeConflictResolver } from './movement.js';
import { EngineTools } from './engine-tools.js';

// ---------------------------------------------------------------------------
// Board & World state
// ---------------------------------------------------------------------------

/** Full state of one board: a single timeline at a single turn. */
export interface Board {
  address: BoardAddress;
  regions: Map<RegionId, RegionState>;
  entities: Map<EntityId, Entity>;
  /** Per-player economies for this timeline. */
  economies: Map<PlayerId, Economy>;
  /** Opaque plugin-specific data (dev card decks, tech trees, etc.). */
  pluginData: Record<string, unknown>;
}

/** The complete multiverse state passed to plugin interfaces. */
export interface WorldState {
  boards: Map<string, Board>; // keyed by boardKey(address)
  pendingBranches: Map<BranchId, PendingBranch>;
}

// ---------------------------------------------------------------------------
// Action context
// ---------------------------------------------------------------------------

export interface ActionContext {
  board: Board;
  world: WorldState;
  player: PlayerId;
  /** The current turn phase ID. */
  currentPhase: string;
  /** Engine tools available for the plugin to call during validation/evaluation. */
  tools: EngineTools;
  /** True when this action is being validated during a half-action phase. */
  isHalfAction: boolean;
  /** The pending branch whose window is closing, if isHalfAction is true. */
  halfActionBranchId: BranchId | undefined;
}

// ---------------------------------------------------------------------------
// Plugin interfaces
// ---------------------------------------------------------------------------

/**
 * Loads the spatial graph for the game map.
 */
export interface IMapLoader {
  loadRegions(): RegionState[];
  getAdjacentRegions(regionId: RegionId): RegionId[];
}

/**
 * Declares a unit type and its properties.
 * Stats are passed to the engine's dice tools when combat is resolved.
 */
export interface IUnitDefinition {
  typeId: string;
  attack?: number;
  defense?: number;
  /**
   * Spatial movement budget per turn. Only relevant for per-budget games
   * (Theater of War). Conquest and Colonist do not use this.
   */
  moveRange?: number;
  /**
   * True if this unit's movement budget covers temporal and lateral steps
   * in addition to spatial steps (Theater of War shared budget model).
   */
  sharedTimeBudget: boolean;
  /** Plugin-specific properties (first_strike, two_hit, carrier_capacity, etc.). */
  properties: Record<string, unknown>;
}

/**
 * Declares one phase of a player's turn.
 * The engine enforces that actions only occur in their declared phase.
 */
export interface ITurnPhase {
  id: string;
  label: string;
  allowedActionTypes: string[];
  allowsTimeTravelActions: boolean;
}

/**
 * Determines whether a proposed action is legal given the current state.
 *
 * The plugin is fully responsible for legality. It may call engine tools
 * (via context.tools) for reachability checks, adjacency checks, step
 * counts, etc., and combine those with its own game-specific rules.
 *
 * Called for normal actions and (with context.isHalfAction = true) for
 * half-actions — the plugin decides what is legal in each case.
 */
export interface IActionValidator {
  validate(action: Action, context: ActionContext): { valid: boolean; reason?: string };
}

/**
 * Resolves a validated action into state changes.
 * May call engine tools (context.tools.dice, context.tools.movement, etc.).
 */
export interface IActionEvaluator {
  evaluate(action: Action, context: ActionContext): ActionResult;
}

/**
 * Declares which committed actions trigger a pending branch and where.
 * Called by the engine after each action is evaluated.
 */
export interface IBranchTrigger {
  shouldBranch(action: Action, result: ActionResult, context: ActionContext): boolean;
  getBranchOrigin(action: Action, result: ActionResult, context: ActionContext): BoardAddress;
}

/**
 * Declares what arriving entities do when they land on a pending branch.
 *
 * Arrival actions execute in the pending timeline's context, in global
 * execution order. Each arriver acts against the state left by prior arrivals.
 * After completing arrival actions the entities are inactive until
 * crystallization.
 *
 * Also declares how loose-mode queued actions resolve when they turn out to
 * be illegal at resolution time.
 */
export interface IArrivalPolicy {
  /**
   * Returns the arrival actions for the given entities. The engine sequences
   * and validates these against the current pending state.
   */
  getArrivalActions(
    branch: PendingBranch,
    arrivingEntities: Entity[],
    context: ActionContext,
  ): Action[];

  /**
   * Per-action-type conflict resolvers for loose adjacency mode.
   * Called when a future-targeted action becomes illegal at resolution time.
   */
  looseModeConflictResolvers: LooseModeConflictResolver[];
}

/**
 * Evaluates victory conditions across the full multiverse.
 * Called at the end of each global turn after all boards have resolved.
 */
export interface IWinCondition {
  evaluate(world: WorldState): PlayerId | null;
}

/**
 * A configurable game setting exposed to session setup.
 */
export interface IGameSetting<T> {
  id: string;
  label: string;
  description: string;
  default: T;
  options?: T[];
}

// ---------------------------------------------------------------------------
// Turn ordering model
// ---------------------------------------------------------------------------

export const TurnOrderModelSchema = z.enum(['sequential', 'simultaneous']);
export type TurnOrderModel = z.infer<typeof TurnOrderModelSchema>;

// ---------------------------------------------------------------------------
// Top-level plugin contract
// ---------------------------------------------------------------------------

/**
 * The complete definition of a game plugin.
 * Registered with the engine at startup via the plugin registry.
 */
export interface IGameDefinition {
  gameId: string;
  name: string;

  turnOrderModel: TurnOrderModel;
  windowMode: WindowMode;

  /**
   * Adjacency mode default for this game.
   * Exposed as a configurable setting; this is the out-of-box default.
   */
  defaultAdjacencyMode: AdjacencyMode;

  /**
   * Movement mode default for this game.
   * Only meaningful for games with spatially-moving pieces (Theater, Conquest).
   * Set to null for portal-jump games (Colonist).
   */
  defaultMovementMode: MovementMode | null;

  minPlayers: number;
  maxPlayers: number;

  /** All configurable settings for this game. */
  settings: IGameSetting<unknown>[];

  mapLoader: IMapLoader;
  unitDefinitions: IUnitDefinition[];
  turnPhases: ITurnPhase[];
  actionValidator: IActionValidator;
  actionEvaluator: IActionEvaluator;
  branchTrigger: IBranchTrigger;
  arrivalPolicy: IArrivalPolicy;
  winCondition: IWinCondition;

  createInitialBoard(players: PlayerId[], settings: Record<string, unknown>): Board;
}
