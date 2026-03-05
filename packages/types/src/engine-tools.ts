import { BoardAddress, Location, RegionId } from './coordinates.js';
import { PlayerId } from './entities.js';
import { AdjacencyMode, MovementSpec, StepCounts } from './movement.js';
import { BranchTree } from './branch.js';
import { WorldState } from './game.js';

// ---------------------------------------------------------------------------
// Movement tools
// ---------------------------------------------------------------------------

export interface MovementTools {
  /**
   * Returns true if the destination timestate is reachable from the source
   * given the adjacency mode.
   *
   * strict: destination must be a played timestate, no gaps.
   * loose:  unplayed and future timestates are reachable.
   */
  isTemporallyReachable(
    from: BoardAddress,
    to: BoardAddress,
    adjacencyMode: AdjacencyMode,
    branchTree: BranchTree,
  ): boolean;

  /**
   * Returns true if there is a valid lateral path between the two board
   * addresses in the branch tree given the adjacency mode.
   *
   * strict: all intermediate timelines must have played states at the
   *         relevant turn number.
   * loose:  gaps (unplayed intermediates) are traversable.
   */
  isLaterallyReachable(
    from: BoardAddress,
    to: BoardAddress,
    adjacencyMode: AdjacencyMode,
    branchTree: BranchTree,
  ): boolean;

  /**
   * Returns the ordered list of intermediate board addresses along the
   * lateral path between from and to. Empty if they are directly adjacent.
   * Only includes existing (played) states — gaps are not returned.
   */
  getIntermediateStates(
    from: BoardAddress,
    to: BoardAddress,
    branchTree: BranchTree,
  ): BoardAddress[];

  /**
   * Returns true if the given location is controlled by the given player
   * in the current world state.
   */
  isControlledBy(location: Location, playerId: PlayerId, world: WorldState): boolean;

  /**
   * Returns true if the given region is spatially adjacent to another region
   * according to the map loader's adjacency graph.
   */
  isSpatiallyAdjacent(a: RegionId, b: RegionId): boolean;

  /**
   * Counts the number of spatial, temporal, and lateral steps in a movement
   * spec. Pure calculation — does not validate legality.
   */
  computeStepCounts(spec: MovementSpec): StepCounts;
}

// ---------------------------------------------------------------------------
// Dice tools
// ---------------------------------------------------------------------------

export type DiceResolutionMode = 'manual' | 'true_random' | 'balanced_blitz';

export interface CombatUnit {
  typeId: string;
  attack: number;
  defense: number;
  /** Any plugin-specific properties (first_strike, two_hit, etc.). */
  properties: Record<string, unknown>;
}

export interface CombatResult {
  attackerCasualties: number;
  defenderCasualties: number;
  /** Full round-by-round log for manual and true_random modes. */
  rounds: Array<{ attackerHits: number; defenderHits: number }>;
}

export interface DiceTools {
  /**
   * Resolves a combat between attacker and defender unit sets.
   * Mode is set per game session; absent defenders are auto-resolved using
   * plugin-provided standing orders.
   */
  resolve(
    attackers: CombatUnit[],
    defenders: CombatUnit[],
    mode: DiceResolutionMode,
  ): CombatResult;

  /**
   * Returns the expected-value outcome for a set of attacker vs defender
   * units without simulating rounds. Used by balanced_blitz mode and AI.
   */
  expectedValue(attackers: CombatUnit[], defenders: CombatUnit[]): CombatResult;
}

// ---------------------------------------------------------------------------
// Adjudication tools (for simultaneous-submission games)
// ---------------------------------------------------------------------------

export interface OrderStrength {
  /** The action being adjudicated. */
  actionId: string;
  /** Number of supporting orders. */
  supportCount: number;
  /** Whether this order is in a standoff (equal strength, no movement). */
  standoff: boolean;
}

export interface AdjudicationTools {
  /**
   * Computes the strength of each order in a submitted order set.
   * The plugin provides the support-counting rules; this tool applies them.
   */
  computeStrengths(
    orders: unknown[],
    countSupport: (order: unknown, allOrders: unknown[]) => number,
  ): OrderStrength[];
}

// ---------------------------------------------------------------------------
// Top-level handle passed to all plugin interfaces
// ---------------------------------------------------------------------------

export interface EngineTools {
  movement: MovementTools;
  dice: DiceTools;
  adjudication: AdjudicationTools;
}
