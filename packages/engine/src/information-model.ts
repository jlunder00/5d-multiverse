import {
  WorldState,
  Board,
  BranchId,
  PlayerId,
  boardKey,
} from '@5d/types';

/**
 * A player is party to a pending branch if they have committed actions there.
 * The engine tracks this via the party set stored in plugin data on the pending board.
 */
export function isParty(world: WorldState, branchId: BranchId, playerId: PlayerId): boolean {
  const branch = world.pendingBranches.get(branchId);
  if (!branch) return false;
  // The initiator is always a party
  if (branch.initiatedBy === playerId) return true;
  // Others are party if they have a pending board with their actions recorded
  // Convention: the pending board's pluginData['parties'] is a string[] of player IDs
  const pendingBoardKey = boardKey(branch.originAddress);
  const pendingBoard = world.boards.get(pendingBoardKey);
  if (!pendingBoard) return false;
  const parties = pendingBoard.pluginData['parties'];
  if (Array.isArray(parties)) {
    return (parties as string[]).includes(playerId as string);
  }
  return false;
}

/**
 * Records a player as a party to a pending branch by updating the pending board's
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

/**
 * Returns a view of the world filtered for the given player under the given fog setting.
 * This is the top-level filter — use fog-of-war.ts for per-setting logic.
 */
export type FogSetting = 'full_information' | 'current_turn_fog' | 'timeline_fog';

export interface PlayerView {
  /** Boards the player can see at full fidelity (current state). */
  visibleBoards: Map<string, Board>;
  /** Boards visible only as their historical (pre-time-travel) state. */
  historicalBoards: Map<string, Board>;
}

/**
 * Returns the pending board's current state for a party member, or the
 * historical board (origin board) for a non-party member.
 */
export function getBoardViewForPlayer(
  world: WorldState,
  branchId: BranchId,
  playerId: PlayerId,
): Board | undefined {
  const branch = world.pendingBranches.get(branchId);
  if (!branch) return undefined;

  const currentBoard = world.boards.get(boardKey(branch.originAddress));

  if (isParty(world, branchId, playerId)) {
    // Party sees current pending state
    return currentBoard;
  }

  // Non-party sees historical state, stored in pluginData['historicalSnapshot']
  if (currentBoard) {
    const snapshot = currentBoard.pluginData['historicalSnapshot'];
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      return snapshot as Board;
    }
  }
  return undefined;
}
