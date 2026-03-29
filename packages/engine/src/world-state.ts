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
// Note: entity_upsert / entity_remove effects are removed. Piece mutations are
// handled via PieceStore directly in game-loop.ts (Phase 3+).

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
 *   region_update  — { region: RegionState } — update a region's state
 *   economy_update — { economy: Economy }    — update a player's economy
 *   plugin_data    — { key: string, value: unknown } — write into pluginData
 *
 * Piece mutations are handled directly via PieceStore in game-loop.ts.
 */
export function applyActionResult(board: Board, result: ActionResult): Board {
  if (!result.success) return board;

  let regions = new Map(board.regions);
  let economies = new Map(board.economies);
  let pluginData = { ...board.pluginData };

  for (const effect of result.effects) {
    const type = effect['type'] as string | undefined;

    if (type === 'region_update') {
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

  return { ...board, regions, economies, pluginData };
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
