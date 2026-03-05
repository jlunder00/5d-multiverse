import {
  BranchWindow,
  BranchId,
  PlayerId,
  Turn,
  WindowMode,
  BoardAddress,
} from '@5d/types';

/**
 * Opens a new sliding window for the given pending branch.
 *
 * @param n - Number of players (= number of turns in one full round)
 */
export function openWindow(
  branchId: BranchId,
  initiator: PlayerId,
  originColumnPlayer: PlayerId,
  openedAtGlobalTurn: Turn,
  n: number,
  mode: WindowMode,
  halfActionBoards: BoardAddress[],
): BranchWindow {
  return {
    branchId,
    mode,
    initiator,
    openedAtGlobalTurn,
    closesAtGlobalTurn: (openedAtGlobalTurn + n) as Turn,
    originColumnPlayer,
    halfActionBoards: mode === 'n+0.5' ? halfActionBoards : [],
    halfActionUsed: false,
  };
}

/**
 * Returns true when the window should close this turn.
 * The window closes on the initiator's next turn (= closesAtGlobalTurn).
 */
export function shouldClose(window: BranchWindow, currentGlobalTurn: Turn): boolean {
  return currentGlobalTurn >= window.closesAtGlobalTurn;
}

/**
 * Returns true if the window is in n+0.5 mode and the half-action has not
 * yet been used.
 */
export function isHalfActionPending(window: BranchWindow): boolean {
  return window.mode === 'n+0.5' && !window.halfActionUsed;
}

/**
 * Returns a new window with halfActionUsed set to true.
 */
export function markHalfActionUsed(window: BranchWindow): BranchWindow {
  return { ...window, halfActionUsed: true };
}

/**
 * Derives the in-scope boards for the half-action from the set of actions
 * that initiated the branch. In-scope = the boards the initiator acted on
 * when committing the branch trigger (source boards) + the pending board.
 *
 * The caller is responsible for providing the pending board address and the
 * source boards (boards from which the initiator sent units/actions).
 */
export function computeHalfActionBoards(
  sourceBoards: BoardAddress[],
  pendingBoard: BoardAddress,
): BoardAddress[] {
  // Deduplicate by key in case sourceBoards includes the pending board
  const seen = new Set<string>();
  const result: BoardAddress[] = [];
  for (const addr of [...sourceBoards, pendingBoard]) {
    const key = `${addr.timeline}:${addr.turn}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(addr);
    }
  }
  return result;
}
