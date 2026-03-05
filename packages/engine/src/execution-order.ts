import { ExecutionOrder, PlayerId, Turn } from '@5d/types';

/**
 * Creates the initial execution order for a game.
 * The priority queue is the player list in their starting order.
 */
export function createExecutionOrder(players: PlayerId[], globalTurn: Turn): ExecutionOrder {
  if (players.length === 0) throw new Error('At least one player required');
  return {
    globalTurn,
    priorityQueue: [...players],
    currentIndex: 0,
  };
}

/** Returns the player whose turn it currently is. */
export function getCurrentPlayer(order: ExecutionOrder): PlayerId {
  const player = order.priorityQueue[order.currentIndex];
  if (player === undefined) throw new Error('currentIndex out of bounds');
  return player;
}

/**
 * Advances to the next player within the current global turn.
 * Returns null if all players have acted (global turn is complete).
 */
export function advancePlayer(order: ExecutionOrder): ExecutionOrder | null {
  const nextIndex = order.currentIndex + 1;
  if (nextIndex >= order.priorityQueue.length) return null;
  return { ...order, currentIndex: nextIndex };
}

/**
 * Advances to the next global turn with rotating priority.
 * The player who was first this turn moves to the end of the queue.
 */
export function advanceGlobalTurn(order: ExecutionOrder): ExecutionOrder {
  const [first, ...rest] = order.priorityQueue;
  if (first === undefined) throw new Error('Empty priority queue');
  return {
    globalTurn: (order.globalTurn + 1) as Turn,
    priorityQueue: [...rest, first],
    currentIndex: 0,
  };
}

/** Returns true when every player has acted this global turn. */
export function isGlobalTurnComplete(order: ExecutionOrder): boolean {
  return order.currentIndex >= order.priorityQueue.length;
}
