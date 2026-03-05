// ---------------------------------------------------------------------------
// Map — cross shape: C in center, N/S/E/W around it
// ---------------------------------------------------------------------------
const REGIONS = ['C', 'N', 'S', 'E', 'W'].map((r) => r);
const ADJACENCY = {
    C: ['N', 'S', 'E', 'W'],
    N: ['C'],
    S: ['C'],
    E: ['C'],
    W: ['C'],
};
const START_REGIONS = ['N', 'S', 'E', 'W'];
const mapLoader = {
    loadRegions() {
        return REGIONS.map((id) => ({ id, owner: null, data: {} }));
    },
    getAdjacentRegions(regionId) {
        return ADJACENCY[regionId] ?? [];
    },
};
// ---------------------------------------------------------------------------
// Unit definitions
// ---------------------------------------------------------------------------
const unitDefinitions = [
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
const turnPhases = [
    {
        id: 'main',
        label: 'Main',
        allowedActionTypes: ['pass', 'move', 'time_branch'],
        allowsTimeTravelActions: true,
    },
];
// ---------------------------------------------------------------------------
// Action validator
// ---------------------------------------------------------------------------
const actionValidator = {
    validate(action, context) {
        const { from, to, type, entityId } = action;
        if (type === 'pass') {
            return { valid: true };
        }
        if (type === 'move') {
            if (!entityId)
                return { valid: false, reason: 'move requires entityId' };
            const entity = context.board.entities.get(entityId);
            if (!entity)
                return { valid: false, reason: 'entity not found' };
            if (entity.owner !== action.player)
                return { valid: false, reason: 'not your piece' };
            if (from.timeline !== to.timeline || from.turn !== to.turn) {
                return { valid: false, reason: 'move must stay on the same board' };
            }
            const adjacent = ADJACENCY[from.region] ?? [];
            if (!adjacent.includes(to.region)) {
                return { valid: false, reason: `${from.region} is not adjacent to ${to.region}` };
            }
            return { valid: true };
        }
        if (type === 'time_branch') {
            if (to.turn >= from.turn) {
                return { valid: false, reason: 'time_branch destination must be a past turn' };
            }
            if (to.turn < 1) {
                return { valid: false, reason: 'cannot branch before turn 1' };
            }
            return { valid: true };
        }
        return { valid: false, reason: `unknown action type: ${type}` };
    },
};
// ---------------------------------------------------------------------------
// Action evaluator
// ---------------------------------------------------------------------------
const actionEvaluator = {
    evaluate(action, context) {
        const { type, entityId } = action;
        if (type === 'pass') {
            return { actionId: action.id, success: true, effects: [] };
        }
        if (type === 'move' && entityId) {
            const entity = context.board.entities.get(entityId);
            if (!entity)
                return { actionId: action.id, success: false, error: 'entity not found', effects: [] };
            const moved = { ...entity, location: { ...action.to } };
            return {
                actionId: action.id,
                success: true,
                effects: [{ type: 'entity_upsert', entity: moved }],
            };
        }
        if (type === 'time_branch') {
            // The piece stays on the source board; only a "flag" is planted in the past.
            // The branch trigger fires separately after this returns.
            return { actionId: action.id, success: true, effects: [] };
        }
        return { actionId: action.id, success: false, error: 'unknown action', effects: [] };
    },
};
// ---------------------------------------------------------------------------
// Branch trigger — fires on time_branch actions
// ---------------------------------------------------------------------------
const branchTrigger = {
    shouldBranch(action, result) {
        return action.type === 'time_branch' && result.success;
    },
    getBranchOrigin(action) {
        // The origin is the past board the player branched to
        return { timeline: action.to.timeline, turn: action.to.turn };
    },
};
// ---------------------------------------------------------------------------
// Arrival policy — no special arrival actions in the stub
// ---------------------------------------------------------------------------
const arrivalPolicy = {
    getArrivalActions() {
        return [];
    },
    looseModeConflictResolvers: [],
};
// ---------------------------------------------------------------------------
// Win condition — never (stub runs forever)
// ---------------------------------------------------------------------------
const winCondition = {
    evaluate() {
        return null;
    },
};
// ---------------------------------------------------------------------------
// Initial board factory
// ---------------------------------------------------------------------------
function createInitialBoard(players) {
    const timeline = 'TL0';
    const turn = 1;
    const regions = new Map(REGIONS.map((id) => [id, { id, owner: null, data: { label: id } }]));
    const entities = new Map();
    players.forEach((player, i) => {
        const startRegion = START_REGIONS[i % START_REGIONS.length];
        const entityId = `piece-${player}`;
        entities.set(entityId, {
            id: entityId,
            owner: player,
            type: 'piece',
            location: { timeline, turn, region: startRegion },
            data: { label: `${player}'s piece` },
        });
    });
    const economies = new Map(players.map((p) => [p, { player: p, resources: {} }]));
    return {
        address: { timeline, turn },
        regions,
        entities,
        economies,
        pluginData: {},
    };
}
// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------
export const stubPlugin = {
    gameId: 'stub',
    name: '5D Stub (Test)',
    turnOrderModel: 'sequential',
    windowMode: 'n',
    defaultAdjacencyMode: 'strict',
    defaultMovementMode: 'staged',
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
//# sourceMappingURL=index.js.map