import { WorldState, Board, PlayerId } from '@5d/types';
import { FogSetting } from './information-model.js';

/**
 * Returns a filtered WorldState containing only what the given player is
 * allowed to see under the configured fog setting.
 *
 * full_information:  all boards visible at current state.
 * current_turn_fog:  stabilization-period boards visible only to parties;
 *                    non-party boards show the last stable view.
 * timeline_fog:      as current_turn_fog, and non-party stabilization boards
 *                    are permanently hidden.
 *
 * Party membership is tracked in board.pluginData['parties'] — a string[]
 * written by the engine's addParty helper when a player sends units there.
 */
export function filterWorldForPlayer(
  world: WorldState,
  playerId: PlayerId,
  fogSetting: FogSetting,
  _activePlayerThisTurn: PlayerId,
): WorldState {
  if (fogSetting === 'full_information') return world;

  const filteredBoards = new Map<string, Board>();

  for (const [key, board] of world.boards) {
    const parties = board.pluginData['parties'];
    const isParty = Array.isArray(parties) && (parties as string[]).includes(playerId as string);

    if (fogSetting === 'timeline_fog' && !isParty) {
      // Non-party player cannot see this board — skip it
      continue;
    }

    if (fogSetting === 'current_turn_fog' && !isParty) {
      // Non-party: show historical snapshot stored in pluginData if available
      const snapshot = board.pluginData['historicalSnapshot'];
      if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
        filteredBoards.set(key, snapshot as Board);
      }
      // If no snapshot, board is simply hidden
      continue;
    }

    filteredBoards.set(key, board);
  }

  return { boards: filteredBoards };
}
