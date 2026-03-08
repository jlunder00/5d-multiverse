import {
  WorldState,
  Board,
  BoardAddress,
  ActionResult,
  RegionId,
  RegionState,
  PlayerId,
  Economy,
  boardKey,
} from '@5d/types';

/** Returns the board at the given address, or undefined if it doesn't exist. */
export function getBoardAt(world: WorldState, address: BoardAddress): Board | undefined {
  return world.boards.get(boardKey(address));
}

/** Inserts or replaces a board in the world state (immutable). */
export function setBoard(world: WorldState, board: Board): WorldState {
  const boards = new Map(world.boards);
  boards.set(boardKey(board.address), board);
  return { ...world, boards };
}

/**
 * Applies the effects from an ActionResult to the given board.
 *
 * Well-known effect keys:
 *   entity_upsert  — { entity: Entity }  — add/update an entity on the board
 *   entity_remove  — { entityId: string } — remove an entity from the board
 *   region_update  — { region: RegionState } — update a region's state
 *   economy_update — { economy: Economy }   — update a player's economy
 *   plugin_data    — { key: string, value: unknown } — write into pluginData
 */
export function applyActionResult(board: Board, result: ActionResult): Board {
  if (!result.success) return board;

  // Phase 1 bridge: entity_upsert/entity_remove still operate on the runtime
  // `entities` Map (not in the Board type). Phase 3 will remove this logic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entities: Map<any, any> = new Map((board as any).entities);
  let regions = new Map(board.regions);
  let economies = new Map(board.economies);
  let pluginData = { ...board.pluginData };

  for (const effect of result.effects) {
    const type = effect['type'] as string | undefined;

    if (type === 'entity_upsert') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = effect['entity'] as any;
      entities = new Map(entities);
      entities.set(entity.id, entity);
    } else if (type === 'entity_remove') {
      const entityId = effect['entityId'] as string;
      entities = new Map(entities);
      entities.delete(entityId);
    } else if (type === 'region_update') {
      const region = effect['region'] as RegionState;
      regions = new Map(regions);
      regions.set(region.id as RegionId, region);
    } else if (type === 'economy_update') {
      const economy = effect['economy'] as Economy;
      economies = new Map(economies);
      economies.set(economy.player as PlayerId, economy);
    } else if (type === 'plugin_data') {
      const key = effect['key'] as string;
      pluginData = { ...pluginData, [key]: effect['value'] };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...board, entities, regions, economies, pluginData } as any as Board;
}

/**
 * Applies an ActionResult to a board in the world, returning a new WorldState.
 */
export function applyResultToWorld(
  world: WorldState,
  address: BoardAddress,
  result: ActionResult,
): WorldState {
  const board = getBoardAt(world, address);
  if (!board) throw new Error(`Board not found: ${boardKey(address)}`);
  return setBoard(world, applyActionResult(board, result));
}
