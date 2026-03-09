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
  PieceStore,
  TurnTransaction,
  PieceState,
  PieceInfo,
  HistoricalPieceInfo,
  SpacetimeCoord,
  RealPieceId,
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
export const PID = (s: string) => s as RealPieceId;

// ---------------------------------------------------------------------------
// MockPieceStore — in-memory PieceStore for engine unit tests
// ---------------------------------------------------------------------------
export class MockPieceStore implements PieceStore {
  // key: `${gameId}:${realPieceId}` → PieceState
  private pieces = new Map<string, PieceState>();
  // key: `${gameId}:${realPieceId}` → current SpacetimeCoord
  private positions = new Map<string, SpacetimeCoord>();
  // key: `${gameId}:${timeline}:${turn}` → HistoricalPieceInfo[]
  private history = new Map<string, HistoricalPieceInfo[]>();

  private pk(gameId: string, realPieceId: string) { return `${gameId}:${realPieceId}`; }
  private bk(gameId: string, timeline: string, turn: number) { return `${gameId}:${timeline}:${turn}`; }

  initGame(gameId: string, initialPieces: { state: PieceState; coord: SpacetimeCoord }[]): void {
    for (const { state, coord } of initialPieces) {
      const key = this.pk(gameId, state.id);
      this.pieces.set(key, state);
      this.positions.set(key, coord);
    }
  }

  getPiecesOnBoard(gameId: string, timeline: string, turn: number): PieceInfo[] {
    const result: PieceInfo[] = [];
    for (const [key, coord] of this.positions) {
      if (!key.startsWith(`${gameId}:`)) continue;
      if (coord.timeline !== timeline || coord.turn !== turn) continue;
      const realPieceId = key.slice(gameId.length + 1) as RealPieceId;
      const state = this.pieces.get(key)!;
      result.push({
        realPieceId,
        owner: coord.owner,
        type: coord.type,
        region: coord.region,
        disambiguator: coord.disambiguator,
        data: state.data,
      });
    }
    return result;
  }

  getHistoricalPieces(gameId: string, timeline: string, turn: number): HistoricalPieceInfo[] {
    return this.history.get(this.bk(gameId, timeline, turn)) ?? [];
  }

  getPieceLocation(gameId: string, realPieceId: RealPieceId): SpacetimeCoord | undefined {
    return this.positions.get(this.pk(gameId, realPieceId));
  }

  getPieceState(gameId: string, realPieceId: RealPieceId): PieceState | undefined {
    return this.pieces.get(this.pk(gameId, realPieceId));
  }

  movePiece(gameId: string, realPieceId: RealPieceId, newCoord: Partial<SpacetimeCoord>): void {
    const key = this.pk(gameId, realPieceId);
    const cur = this.positions.get(key);
    if (!cur) throw new Error(`movePiece: piece "${realPieceId}" not found in game "${gameId}"`);
    this.positions.set(key, { ...cur, ...newCoord });
  }

  updatePieceData(gameId: string, realPieceId: RealPieceId, data: Record<string, unknown>): void {
    const key = this.pk(gameId, realPieceId);
    const cur = this.pieces.get(key);
    if (!cur) throw new Error(`updatePieceData: piece "${realPieceId}" not found in game "${gameId}"`);
    this.pieces.set(key, { ...cur, data: { ...cur.data, ...data } });
  }

  removePiece(gameId: string, realPieceId: RealPieceId): void {
    this.positions.delete(this.pk(gameId, realPieceId));
    // pieces entry retained (like SQLite)
  }

  addPiece(gameId: string, state: PieceState, coord: SpacetimeCoord): void {
    const key = this.pk(gameId, state.id);
    this.pieces.set(key, state);
    this.positions.set(key, coord);
  }

  advanceAllTimelines(gameId: string, timelines: { timeline: string; fromTurn: number }[]): void {
    for (const { timeline, fromTurn } of timelines) {
      // Snapshot current board to history
      const current = this.getPiecesOnBoard(gameId, timeline, fromTurn);
      const snap: HistoricalPieceInfo[] = current.map((p) => ({
        owner: p.owner,
        type: p.type,
        region: p.region,
        disambiguator: p.disambiguator,
        data: p.data,
      }));
      this.history.set(this.bk(gameId, timeline, fromTurn), snap);
      // Advance each piece's turn
      for (const [key, coord] of this.positions) {
        if (!key.startsWith(`${gameId}:`)) continue;
        if (coord.timeline !== timeline || coord.turn !== fromTurn) continue;
        this.positions.set(key, { ...coord, turn: fromTurn + 1 });
      }
    }
  }

  createBranch(gameId: string, params: {
    originTimeline: string;
    originTurn: number;
    newTimelineId: string;
    travelerId: RealPieceId;
    travelerDestRegion: RegionId;
  }): void {
    const { originTimeline, originTurn, newTimelineId, travelerId, travelerDestRegion } = params;

    const historicalPieces = this.getHistoricalPieces(gameId, originTimeline, originTurn);
    if (historicalPieces.length === 0) {
      throw new Error(`createBranch: no historical snapshot at (${originTimeline}, ${originTurn})`);
    }

    // Bootstrap new timeline from historical snapshot (excluding the traveler itself)
    for (const hp of historicalPieces) {
      const newId = `${newTimelineId}-${hp.owner}-${hp.type}-${hp.disambiguator}` as RealPieceId;
      this.addPiece(gameId,
        { id: newId, owner: hp.owner, type: hp.type, data: hp.data },
        { timeline: newTimelineId, turn: originTurn, region: hp.region,
          owner: hp.owner, type: hp.type, disambiguator: hp.disambiguator },
      );
    }

    // Get traveler state
    const travelerState = this.getPieceState(gameId, travelerId);
    if (!travelerState) throw new Error(`createBranch: traveler "${travelerId}" not found`);

    // Remove traveler from source
    this.removePiece(gameId, travelerId);

    // Add traveler to new timeline at destination region
    this.addPiece(gameId, travelerState, {
      timeline: newTimelineId,
      turn: originTurn,
      region: travelerDestRegion,
      owner: travelerState.owner,
      type: travelerState.type,
      disambiguator: 0,
    });
  }

  beginTurn(_gameId: string): TurnTransaction {
    return {
      savepoint: () => {},
      rollbackTo: () => {},
      commit: () => {},
      rollback: () => {},
    };
  }

  deleteGame(gameId: string): void {
    const prefix = `${gameId}:`;
    for (const key of [...this.pieces.keys()]) {
      if (key.startsWith(prefix)) this.pieces.delete(key);
    }
    for (const key of [...this.positions.keys()]) {
      if (key.startsWith(prefix)) this.positions.delete(key);
    }
    for (const key of [...this.history.keys()]) {
      if (key.startsWith(prefix)) this.history.delete(key);
    }
  }
}

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
      const piece = context.board.pieces.find((p) => p.realPieceId === entityId);
      if (!piece) return { valid: false, reason: 'piece not found on board' };
      if ((piece.owner as string) !== (action.player as string)) return { valid: false, reason: 'not your piece' };
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
      const piece = context.board.pieces.find((p) => p.realPieceId === entityId);
      if (!piece) return { valid: false, reason: 'piece not found on board' };
      if ((piece.owner as string) !== (action.player as string)) return { valid: false, reason: 'not your piece' };
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
      const piece = context.board.pieces.find((p) => p.realPieceId === entityId);
      if (!piece) return { actionId: action.id, success: false, error: 'piece not found', effects: [] };
      // Spatial move: mutate store directly, return empty effects
      if (context.pieceStore) {
        context.pieceStore.movePiece(context.gameId, entityId as RealPieceId, { region: action.to.region });
      }
      return { actionId: action.id, success: true, effects: [] };
    }

    if ((type as string) === 'move_to_past') {
      // Engine handles piece removal and branch bootstrap via pieceStore.createBranch()
      return { actionId: action.id, success: true, effects: [] };
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
  _opts: {
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
  const pluginData: Record<string, unknown> = {};

  return {
    address: { timeline: tl, turn: tr },
    regions,
    pieces: [],
    economies: new Map(),
    pluginData,
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
  pieceStore?: PieceStore,
  gameId = 'test-game',
): GameLoopState {
  const pids = players.map(P);
  return {
    world,
    branchTree: createRootTimeline(TL('TL0')),
    order: createExecutionOrder(pids, T(globalTurn)),
    windows: new Map<BranchId, BranchWindow>(),
    winner: null,
    gameId,
    pieceStore,
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
    entityId: entityId ? PID(entityId) : undefined,
    payload: {},
    submittedAt: Date.now(),
  };
}
