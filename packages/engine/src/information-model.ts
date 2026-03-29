import {
  WorldState,
  Board,
  BranchId,
  PlayerId,
} from '@5d/types';

/**
 * A player is party to a stabilization-period board if they have committed
 * actions there. The engine tracks this via the parties list in pluginData.
 */
export function isParty(world: WorldState, branchId: BranchId, playerId: PlayerId): boolean {
  // branchId === timelineId as string — find any board on that timeline
  for (const [, board] of world.boards) {
    if ((board.address.timeline as string) !== (branchId as string)) continue;
    if (board.pluginData['initiatedBy'] === (playerId as string)) return true;
    const parties = board.pluginData['parties'];
    if (Array.isArray(parties) && (parties as string[]).includes(playerId as string)) {
      return true;
    }
  }
  return false;
}

/**
 * Records a player as a party to a branch by updating the board's
 * pluginData['parties'] list. Returns the updated board.
 */
export function addParty(board: Board, playerId: PlayerId): Board {
  const parties: string[] = Array.isArray(board.pluginData['parties'])
    ? [...(board.pluginData['parties'] as string[])]
    : [];
  if (!parties.includes(playerId as string)) {
    parties.push(playerId as string);
  }
  return { ...board, pluginData: { ...board.pluginData, parties } };
}

export type FogSetting = 'full_information' | 'current_turn_fog' | 'timeline_fog';

export interface PlayerView {
  /** Boards the player can see at full fidelity (current state). */
  visibleBoards: Map<string, Board>;
  /** Boards visible only as their historical (pre-time-travel) state. */
  historicalBoards: Map<string, Board>;
}

/**
 * Returns a view of the board for the given player — current state if party,
 * or undefined if not visible. Historical piece data is now in PieceStore
 * (getHistoricalPieces), not in pluginData.
 */
export function getBoardViewForPlayer(
  world: WorldState,
  branchId: BranchId,
  playerId: PlayerId,
): Board | undefined {
  for (const [, board] of world.boards) {
    if ((board.address.timeline as string) !== (branchId as string)) continue;
    if (isParty(world, branchId, playerId)) return board;
    return undefined;
  }
  return undefined;
}
