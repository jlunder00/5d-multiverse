import { WorldState, Board, PlayerId, boardKey } from '@5d/types';
import { FogSetting, isParty, getBoardViewForPlayer } from './information-model.js';

/**
 * Returns a filtered WorldState containing only what the given player is
 * allowed to see under the configured fog setting.
 *
 * full_information:  all boards visible at current state.
 * current_turn_fog:  pending boards visible only to parties; non-party pending
 *                    boards show historical view.
 * timeline_fog:      as current_turn_fog, and non-party pending boards are
 *                    permanently hidden (not even historical view shown).
 */
export function filterWorldForPlayer(
  world: WorldState,
  playerId: PlayerId,
  fogSetting: FogSetting,
  activePlayerThisTurn: PlayerId,
): WorldState {
  if (fogSetting === 'full_information') return world;

  const filteredBoards = new Map<string, Board>();

  // Include all non-pending boards as-is
  for (const [key, board] of world.boards) {
    filteredBoards.set(key, board);
  }

  // Filter pending boards based on party status and fog setting
  for (const [branchId, branch] of world.pendingBranches) {
    const key = boardKey(branch.originAddress);
    const party = isParty(world, branchId, playerId);

    if (fogSetting === 'timeline_fog' && !party) {
      // Non-party: hide the pending board entirely
      filteredBoards.delete(key);
      continue;
    }

    if (fogSetting === 'current_turn_fog') {
      if (party) {
        // Party sees current state — already included above
        continue;
      }
      // Non-party: replace with historical snapshot
      const historicalView = getBoardViewForPlayer(world, branchId, playerId);
      if (historicalView) {
        filteredBoards.set(key, historicalView);
      } else {
        filteredBoards.delete(key);
      }
    }
  }

  // current_turn_fog: hide other players' in-progress board moves
  // (boards being actively resolved this turn by a different player)
  if (fogSetting === 'current_turn_fog' && activePlayerThisTurn !== playerId) {
    // The active player's moves are not yet visible to others.
    // This is enforced at the API layer (don't send updates mid-batch).
    // The world state itself reflects committed state — no extra filtering needed here.
  }

  return { boards: filteredBoards, pendingBranches: world.pendingBranches };
}
