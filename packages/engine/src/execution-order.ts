import { ExecutionOrder, PlayerId, Turn } from '@5d/types';

/**
 * Creates the initial execution order for a game.
 * globalTurn increments on every player's endTurn.
 * At turn T, the player at index (T-1) % n takes their turn.
 */
export function createExecutionOrder(players: PlayerId[], globalTurn: Turn): ExecutionOrder {
  if (players.length === 0) throw new Error('At least one player required');
  const n = players.length;
  const currentIndex = ((globalTurn - 1) % n + n) % n;
  return {
    globalTurn,
    priorityQueue: [...players],
    currentIndex,
  };
}

/** Returns the player whose turn it currently is. */
export function getCurrentPlayer(order: ExecutionOrder): PlayerId {
  const player = order.priorityQueue[order.currentIndex];
  if (player === undefined) throw new Error('currentIndex out of bounds');
  return player;
}

/**
 * Advances to the next player and increments globalTurn.
 * Called once per endTurn — each player's turn is one global turn.
 */
export function advanceGlobalTurn(order: ExecutionOrder): ExecutionOrder {
  const n = order.priorityQueue.length;
  return {
    globalTurn: (order.globalTurn + 1) as Turn,
    priorityQueue: order.priorityQueue,
    currentIndex: (order.currentIndex + 1) % n,
  };
}

/** @deprecated Not used in current model. */
export function advancePlayer(order: ExecutionOrder): ExecutionOrder | null {
  return null;
}

/** @deprecated Not used in current model. */
export function isGlobalTurnComplete(_order: ExecutionOrder): boolean {
  return false;
}
