import { z } from 'zod';
import { Location, BoardAddress, RegionId } from './coordinates.js';
import { Entity, EntityId, RegionState, Economy, PlayerId } from './entities.js';
import { Action, ActionId, ActionResult } from './actions.js';
import { BranchId, PendingBranch } from './branch.js';
import { WindowMode } from './window.js';

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
// Action validation context
// ---------------------------------------------------------------------------

export interface ActionContext {
  board: Board;
  world: WorldState;
  player: PlayerId;
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
 * Returns region nodes and their adjacency relationships.
 */
export interface IMapLoader {
  loadRegions(): RegionState[];
  /** Returns the IDs of regions spatially adjacent to the given region. */
  getAdjacentRegions(regionId: RegionId): RegionId[];
}

/**
 * Declares unit types and their properties.
 * Stats are consumed by the engine's dice infrastructure.
 */
export interface IUnitDefinition {
  typeId: string;
  /** Attack value (d6 roll threshold). Undefined for non-combat units. */
  attack?: number;
  /** Defense value (d6 roll threshold). Undefined for non-combat units. */
  defense?: number;
  /** Spatial movement budget per turn. Undefined for immobile units. */
  moveRange?: number;
  /** True if this unit's movement budget also covers temporal/lateral hops. */
  sharedTimeBudget: boolean;
  /** Opaque plugin-specific properties (first strike, two-hit, etc.). */
  properties: Record<string, unknown>;
}

/**
 * Declares the phases of a player's turn in order.
 * The engine uses this to enforce that actions only occur in valid phases.
 */
export interface ITurnPhase {
  id: string;
  /** Human-readable label. */
  label: string;
  /** Action type IDs that are legal during this phase. */
  allowedActionTypes: string[];
  /** Whether time-travel actions are permitted during this phase. */
  allowsTimeTravelActions: boolean;
}

/**
 * Determines whether a proposed action is legal given the current state.
 * Called for normal actions and (with context.isHalfAction = true) for
 * half-actions. The plugin is fully responsible for what is legal in each case.
 */
export interface IActionValidator {
  validate(action: Action, context: ActionContext): { valid: boolean; reason?: string };
}

/**
 * Resolves a validated action into state changes.
 * May call engine reusable tools (dice roller, movement resolver, etc.)
 * via the EngineTools handle passed at plugin registration.
 */
export interface IActionEvaluator {
  evaluate(action: Action, context: ActionContext): ActionResult;
}

/**
 * Declares which committed actions trigger a pending branch, and under
 * what conditions. Called after an action is evaluated.
 */
export interface IBranchTrigger {
  /** Returns true if this action should create (or contribute to) a pending branch. */
  shouldBranch(action: Action, result: ActionResult, context: ActionContext): boolean;
  /**
   * Returns the board address the branch should originate from.
   * The engine uses this to look up or create the pending branch.
   */
  getBranchOrigin(action: Action, result: ActionResult, context: ActionContext): BoardAddress;
}

/**
 * Declares the arrival policy for this game.
 * The engine calls onArrival when an entity arrives at a pending branch.
 */
export interface IArrivalPolicy {
  /**
   * Called when a player's entities arrive at a pending branch.
   * The plugin returns the list of actions the arriving entities must or may
   * take (arrival actions). The engine sequences these against current pending
   * state in global execution order.
   */
  getArrivalActions(
    branch: PendingBranch,
    arrivingEntities: Entity[],
    context: ActionContext,
  ): Action[];
}

/**
 * Evaluates victory conditions across the full multiverse.
 * Called at the end of each global turn after all boards have resolved.
 */
export interface IWinCondition {
  /** Returns the winning player ID, or null if no winner yet. */
  evaluate(world: WorldState): PlayerId | null;
}

/**
 * Declares all configurable settings for this game and their defaults.
 * The engine surfaces these to the session setup UI.
 */
export interface IGameSetting<T> {
  id: string;
  label: string;
  description: string;
  default: T;
  options?: T[]; // for enum-style settings
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
 * Registered with the engine at startup.
 */
export interface IGameDefinition {
  /** Unique identifier for this game (e.g. "colonist", "conquest", "theater"). */
  gameId: string;
  /** Human-readable name. */
  name: string;

  /** Turn ordering model this game uses. */
  turnOrderModel: TurnOrderModel;

  /** Sliding window mode for pending branches in this game. */
  windowMode: WindowMode;

  /** Minimum number of players. */
  minPlayers: number;
  /** Maximum number of players. */
  maxPlayers: number;

  /** Configurable settings exposed to session setup. */
  settings: IGameSetting<unknown>[];

  // Plugin interface implementations
  mapLoader: IMapLoader;
  unitDefinitions: IUnitDefinition[];
  turnPhases: ITurnPhase[];
  actionValidator: IActionValidator;
  actionEvaluator: IActionEvaluator;
  branchTrigger: IBranchTrigger;
  arrivalPolicy: IArrivalPolicy;
  winCondition: IWinCondition;

  /** Called once at game start to build the initial board state. */
  createInitialBoard(players: PlayerId[], settings: Record<string, unknown>): Board;
}
