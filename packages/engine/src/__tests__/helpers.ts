/**
 * Shared test fixtures for engine unit tests.
 * Defines a minimal cross-map plugin (5 regions: C, N, S, E, W) and
 * helper functions for building GameLoopState without a running server.
 */
import type {
  IGameDefinition,
  IMapLoader,
  IActionValidator,
  IActionEvaluator,
  IBranchTrigger,
  IArrivalPolicy,
  IWinCondition,
  EngineTools,
  WorldState,
  Board,
  BoardAddress,
  RegionState,
  Economy,
  Action,
  ActionResult,
  ActionContext,
  PlayerId,
  RegionId,
  TimelineId,
  Turn,
  BranchId,
  BranchWindow,
} from '@5d/types';
import { boardKey } from '@5d/types';
import type { GameLoopState } from '../game-loop.js';
import { createExecutionOrder } from '../execution-order.js';
import { createRootTimeline } from '../branch-tree.js';
import { createMovementTools } from '../tools/movement.js';

// ---------------------------------------------------------------------------
// Branded-type helpers
// ---------------------------------------------------------------------------
export const TL = (s: string) => s as TimelineId;
export const T = (n: number) => n as Turn;
export const P = (s: string) => s as PlayerId;
/** Phase 1 bridge: EID returns a string used as a runtime entity key (not RealPieceId). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EID = (s: string) => s as any;
export const RID = (s: string) => s as RegionId;

// ---------------------------------------------------------------------------
// Cross-map layout: C center, N/S/E/W arms
// ---------------------------------------------------------------------------
const ADJACENCY: Record<string, string[]> = {
  C: ['N', 'S', 'E', 'W'],
  N: ['C'],
  S: ['C'],
  E: ['C'],
  W: ['C'],
};

const mapLoader: IMapLoader = {
  loadRegions() {
    return (['C', 'N', 'S', 'E', 'W'] as const).map((id) => ({
      id: id as RegionId,
      owner: null,
      data: {},
    }));
  },
  getAdjacentRegions(regionId: RegionId): RegionId[] {
    return (ADJACENCY[regionId as string] ?? []) as RegionId[];
  },
};

// ---------------------------------------------------------------------------
// Minimal test plugin
// ---------------------------------------------------------------------------
const actionValidator: IActionValidator = {
  validate(action: Action, context: ActionContext) {
    const { from, to, type, entityId } = action;

    if ((type as string) === 'pass') return { valid: true };

    if ((type as string) === 'move') {
      if (!entityId) return { valid: false, reason: 'move requires entityId' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = (context.board as any).entities?.get(entityId);
      if (!entity) return { valid: false, reason: 'entity not found on board' };
      if (entity.owner !== action.player) return { valid: false, reason: 'not your piece' };
      if (from.timeline !== to.timeline || from.turn !== to.turn) {
        return { valid: false, reason: 'move must stay on the same board' };
      }
      const adj = ADJACENCY[from.region as string] ?? [];
      if (!adj.includes(to.region as string)) {
        return { valid: false, reason: `${from.region} is not adjacent to ${to.region}` };
      }
      return { valid: true };
    }

    if ((type as string) === 'move_to_past') {
      if (!entityId) return { valid: false, reason: 'move_to_past requires entityId' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = (context.board as any).entities?.get(entityId);
      if (!entity) return { valid: false, reason: 'entity not found on board' };
      if (entity.owner !== action.player) return { valid: false, reason: 'not your piece' };
      if ((to.turn as number) >= (from.turn as number)) {
        return { valid: false, reason: 'destination must be a past turn' };
      }
      return { valid: true };
    }

    return { valid: false, reason: `unknown action type: ${type}` };
  },
};

const actionEvaluator: IActionEvaluator = {
  evaluate(action: Action, context: ActionContext): ActionResult {
    const { type, entityId } = action;

    if ((type as string) === 'pass') {
      return { actionId: action.id, success: true, effects: [] };
    }

    if ((type as string) === 'move' && entityId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = (context.board as any).entities?.get(entityId);
      if (!entity) return { actionId: action.id, success: false, error: 'entity not found', effects: [] };
      const moved = { ...entity, location: { ...action.to } };
      return {
        actionId: action.id,
        success: true,
        effects: [{ type: 'entity_upsert', entity: moved }],
      };
    }

    if ((type as string) === 'move_to_past' && entityId) {
      return { actionId: action.id, success: true, effects: [{ type: 'entity_remove', entityId }] };
    }

    return { actionId: action.id, success: false, error: 'unknown action', effects: [] };
  },
};

const branchTrigger: IBranchTrigger = {
  shouldBranch(action: Action, result: ActionResult, _context: ActionContext): boolean {
    // Always return true for move_to_past — the engine detects subsequent arrivals
    // internally and merges them into the existing ghost board.
    return (action.type as string) === 'move_to_past' && result.success;
  },
  getBranchOrigin(action: Action): BoardAddress {
    return { timeline: action.to.timeline, turn: action.to.turn };
  },
};

const arrivalPolicy: IArrivalPolicy = {
  getArrivalActions(): Action[] { return []; },
  looseModeConflictResolvers: [],
};

const winCondition: IWinCondition = {
  evaluate(): PlayerId | null { return null; },
};

export const testPlugin: IGameDefinition = {
  gameId: 'test',
  name: 'Test Plugin',
  turnOrderModel: 'sequential',
  windowMode: 'n',
  defaultAdjacencyMode: 'strict',
  defaultMovementMode: 'staged',
  tl0StabilizationReachable: true,
  branchStabilizationReachable: false,
  minPlayers: 1,
  maxPlayers: 4,
  settings: [],
  mapLoader,
  unitDefinitions: [{ typeId: 'piece' as any, attack: 0, defense: 0, sharedTimeBudget: false, properties: {} }],
  turnPhases: [{
    id: 'main',
    label: 'Main',
    allowedActionTypes: ['pass', 'move', 'move_to_past'] as any[],
    allowsTimeTravelActions: true,
  }],
  actionValidator,
  actionEvaluator,
  branchTrigger,
  arrivalPolicy,
  winCondition,
  createInitialBoard(): Board { return makeBoard('TL0', 1) as Board; },
};

// ---------------------------------------------------------------------------
// EngineTools (movement uses ADJACENCY above)
// ---------------------------------------------------------------------------
export const testTools: EngineTools = {
  movement: createMovementTools((r) => (ADJACENCY[r as string] ?? []) as RegionId[]),
  dice: { resolve: () => ({ attackerCasualties: [], defenderCasualties: [], rounds: [] }), expectedValue: () => ({ attackerSurvival: 0, defenderSurvival: 0 }) },
  adjudication: { computeStrengths: () => [] },
};

// ---------------------------------------------------------------------------
// Board / world / state builders
// ---------------------------------------------------------------------------

/** Create an empty board at (timeline, turn). */
export function makeBoard(
  timeline: string,
  turn: number,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entities?: any[];   // Phase 1 bridge: runtime entity objects (not typed)
    isPending?: boolean;
    originAddress?: BoardAddress;
  } = {},
): Board {
  const tl = TL(timeline);
  const tr = T(turn);
  const regions = new Map<RegionId, RegionState>(
    (['C', 'N', 'S', 'E', 'W'] as const).map((id) => [
      id as RegionId,
      { id: id as RegionId, owner: null, data: {} },
    ]),
  );
  // Phase 1 bridge: keep runtime entities Map as untyped extra field.
  // Board type has pieces: PieceInfo[], so we cast through any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities = new Map<any, any>(
    (opts.entities ?? []).map((e) => [e.id, e]),
  );
  const pluginData: Record<string, unknown> = {};

  return {
    address: { timeline: tl, turn: tr },
    regions,
    entities,
    pieces: [],
    economies: new Map(),
    pluginData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Board;
}

/**
 * Create a runtime entity object at the given location.
 * Phase 1 bridge: returns plain object (not typed as Entity since Entity is removed).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeEntity(id: string, owner: string, timeline: string, turn: number, region: string): any {
  return {
    id,
    owner: P(owner),
    type: 'piece',
    location: { timeline: TL(timeline), turn: T(turn), region: RID(region) },
    data: {},
  };
}

/** Build a WorldState from an array of boards. */
export function makeWorld(boards: Board[]): WorldState {
  const map = new Map<string, Board>(boards.map((b) => [boardKey(b.address), b]));
  return { boards: map };
}

/** Build a minimal GameLoopState. */
export function makeState(
  world: WorldState,
  players: string[],
  globalTurn: number,
): GameLoopState {
  const pids = players.map(P);
  return {
    world,
    branchTree: createRootTimeline(TL('TL0')),
    order: createExecutionOrder(pids, T(globalTurn)),
    windows: new Map<BranchId, BranchWindow>(),
    winner: null,
  };
}

/** Build a minimal Action. */
export function makeAction(
  type: string,
  player: string,
  from: { timeline: string; turn: number; region: string },
  to: { timeline: string; turn: number; region: string },
  entityId?: string,
): Action {
  return {
    id: `act-${Date.now()}` as any,
    type: type as any,
    player: P(player),
    from: { timeline: TL(from.timeline), turn: T(from.turn), region: RID(from.region) },
    to: { timeline: TL(to.timeline), turn: T(to.turn), region: RID(to.region) },
    entityId: entityId ? EID(entityId) : undefined,
    payload: {},
    submittedAt: Date.now(),
  };
}
