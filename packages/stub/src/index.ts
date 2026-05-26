import {
  IGameDefinition,
  IMapLoader,
  IUnitDefinition,
  ITurnPhase,
  IActionValidator,
  IActionEvaluator,
  IBranchTrigger,
  IArrivalPolicy,
  IWinCondition,
  Board,
  BoardAddress,
  RegionState,
  Economy,
  PlayerId,
  RegionId,
  ActionResult,
  Action,
  ActionContext,
} from '@5d/types';

// ---------------------------------------------------------------------------
// Map — cross shape: C in center, N/S/E/W around it
// ---------------------------------------------------------------------------

const REGIONS: RegionId[] = ['C', 'N', 'S', 'E', 'W'].map((r) => r as RegionId);

const ADJACENCY: Record<string, RegionId[]> = {
  C: ['N', 'S', 'E', 'W'] as RegionId[],
  N: ['C'] as RegionId[],
  S: ['C'] as RegionId[],
  E: ['C'] as RegionId[],
  W: ['C'] as RegionId[],
};

const START_REGIONS: RegionId[] = ['N', 'S', 'E', 'W'] as RegionId[];

const mapLoader: IMapLoader = {
  loadRegions(): RegionState[] {
    return REGIONS.map((id) => ({ id, owner: null, data: {} }));
  },
  getAdjacentRegions(regionId: RegionId): RegionId[] {
    return ADJACENCY[regionId as string] ?? [];
  },
};

// ---------------------------------------------------------------------------
// Unit definitions
// ---------------------------------------------------------------------------

const unitDefinitions: IUnitDefinition[] = [
  {
    typeId: 'piece',
    attack: 0,
    defense: 0,
    sharedTimeBudget: false,
    properties: {},
  },
];

// ---------------------------------------------------------------------------
// Turn phases
// ---------------------------------------------------------------------------

const turnPhases: ITurnPhase[] = [
  {
    id: 'main',
    label: 'Main',
    allowedActionTypes: ['pass', 'move', 'move_to_past'],
    allowsTimeTravelActions: true,
  },
];

// ---------------------------------------------------------------------------
// Action validator
// ---------------------------------------------------------------------------

const actionValidator: IActionValidator = {
  validate(action: Action, context: ActionContext) {
    const { from, to, type, entityId } = action;

    if (type === ('pass' as typeof type)) {
      return { valid: true };
    }

    if (type === ('move' as typeof type)) {
      if (!entityId) return { valid: false, reason: 'move requires entityId' };

      const piece = context.board.pieces.find((p) => p.realPieceId === entityId);
      if (!piece) return { valid: false, reason: 'piece not found' };
      if ((piece.owner as string) !== (action.player as string)) return { valid: false, reason: 'not your piece' };
      if (from.timeline !== to.timeline || from.turn !== to.turn) {
        return { valid: false, reason: 'move must stay on the same board' };
      }

      const adjacent = ADJACENCY[from.region as string] ?? [];
      if (!adjacent.includes(to.region)) {
        return { valid: false, reason: `${from.region} is not adjacent to ${to.region}` };
      }
      return { valid: true };
    }

    if (type === ('move_to_past' as typeof type)) {
      if (!entityId) return { valid: false, reason: 'move_to_past requires entityId' };
      const piece = context.board.pieces.find((p) => p.realPieceId === entityId);
      if (!piece) return { valid: false, reason: 'piece not found' };
      if ((piece.owner as string) !== (action.player as string)) return { valid: false, reason: 'not your piece' };
      if (to.turn >= from.turn) return { valid: false, reason: 'destination must be a past turn' };
      return { valid: true };
    }

    return { valid: false, reason: `unknown action type: ${type}` };
  },
};

// ---------------------------------------------------------------------------
// Action evaluator
// ---------------------------------------------------------------------------

const actionEvaluator: IActionEvaluator = {
  evaluate(action: Action, context: ActionContext): ActionResult {
    const { type, entityId } = action;

    if (type === ('pass' as typeof type)) {
      return { actionId: action.id, success: true, effects: [] };
    }

    if (type === ('move' as typeof type) && entityId) {
      const piece = context.board.pieces.find((p) => p.realPieceId === entityId);
      if (!piece) return { actionId: action.id, success: false, error: 'piece not found', effects: [] };
      // Spatial move: mutate store directly, engine handles board state
      if (context.pieceStore) {
        context.pieceStore.movePiece(context.gameId, entityId, { region: action.to.region });
      }
      return { actionId: action.id, success: true, effects: [] };
    }

    if (type === ('move_to_past' as typeof type)) {
      // Engine handles piece removal and branch bootstrap via pieceStore.createBranch()
      return { actionId: action.id, success: true, effects: [] };
    }

    return { actionId: action.id, success: false, error: 'unknown action', effects: [] };
  },
};

// ---------------------------------------------------------------------------
// Branch trigger — fires on move_to_past actions
// ---------------------------------------------------------------------------

const branchTrigger: IBranchTrigger = {
  shouldBranch(action: Action, result: ActionResult, _context: ActionContext): boolean {
    return (action.type as string) === 'move_to_past' && result.success;
  },
  getBranchOrigin(action: Action): BoardAddress {
    return { timeline: action.to.timeline, turn: action.to.turn };
  },
};

// ---------------------------------------------------------------------------
// Arrival policy — no special arrival actions in the stub
// ---------------------------------------------------------------------------

const arrivalPolicy: IArrivalPolicy = {
  getArrivalActions(_branchId, _arrivingEntities, _context): Action[] {
    return [];
  },
  looseModeConflictResolvers: [],
};

// ---------------------------------------------------------------------------
// Win condition — never (stub runs forever)
// ---------------------------------------------------------------------------

const winCondition: IWinCondition = {
  evaluate(): PlayerId | null {
    return null;
  },
};

// ---------------------------------------------------------------------------
// Initial board factory
// ---------------------------------------------------------------------------

function createInitialBoard(players: PlayerId[]): Board {
  const timeline = 'TL0' as ReturnType<typeof String> & { __brand: 'TimelineId' } as any;
  const turn = 1 as any;

  const regions = new Map<RegionId, RegionState>(
    REGIONS.map((id) => [id, { id, owner: null, data: { label: id as string } }]),
  );

  const pieces = players.map((player, i) => {
    const region = START_REGIONS[i % START_REGIONS.length]!;
    return {
      realPieceId: `piece-${player}` as import('@5d/types').RealPieceId,
      owner: player,
      type: 'piece' as import('@5d/types').UnitTypeId,
      region,
      disambiguator: 0,
      data: { label: `${player}'s piece` },
    };
  });

  const economies = new Map<PlayerId, Economy>(
    players.map((p) => [p, { player: p, resources: {} }]),
  );

  return {
    address: { timeline, turn },
    regions,
    pieces,
    economies,
    pluginData: {},
  };
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export const stubPlugin: IGameDefinition = {
  gameId: 'stub',
  name: '5D Stub (Test)',
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
  unitDefinitions,
  turnPhases,
  actionValidator,
  actionEvaluator,
  branchTrigger,
  arrivalPolicy,
  winCondition,
  createInitialBoard,
};
