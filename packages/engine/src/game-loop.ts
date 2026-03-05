import {
  IGameDefinition,
  WorldState,
  ExecutionOrder,
  PlayerId,
  Action,
  ActionContext,
  ActionResult,
  BoardAddress,
  BranchId,
  EngineTools,
  boardKey,
} from '@5d/types';
import { getBoardAt, applyResultToWorld, addPendingBranch, updatePendingBranch } from './world-state.js';
import { getCurrentPlayer, advancePlayer, advanceGlobalTurn, isGlobalTurnComplete } from './execution-order.js';
import { openWindow, shouldClose, isHalfActionPending, markHalfActionUsed, computeHalfActionBoards } from './window-manager.js';
import { createPendingBranch, crystallizeBranch } from './branch-tree.js';
import { addParty } from './information-model.js';
import { BranchTree, BranchWindow, Turn } from '@5d/types';

export interface GameLoopState {
  world: WorldState;
  order: ExecutionOrder;
  branchTree: BranchTree;
  /** Open sliding windows keyed by branchId. */
  windows: Map<BranchId, BranchWindow>;
  /** Player declared winner, if any. */
  winner: PlayerId | null;
}

/**
 * Builds an ActionContext for the given board and player.
 */
function buildContext(
  world: WorldState,
  address: BoardAddress,
  player: PlayerId,
  order: ExecutionOrder,
  plugin: IGameDefinition,
  tools: EngineTools,
  isHalfAction: boolean,
  halfActionBranchId: BranchId | undefined,
): ActionContext {
  const board = getBoardAt(world, address);
  if (!board) throw new Error(`Board not found: ${boardKey(address)}`);
  const phase = plugin.turnPhases[0];
  if (!phase) throw new Error('Plugin has no turn phases');
  return {
    board,
    world,
    player,
    currentPhase: phase.id,
    tools,
    isHalfAction,
    halfActionBranchId,
  };
}

/**
 * Validates and evaluates a single action, applies the result to world state,
 * checks branch triggers, and returns the updated state.
 */
export function processAction(
  state: GameLoopState,
  plugin: IGameDefinition,
  tools: EngineTools,
  action: Action,
  address: BoardAddress,
  isHalfAction: boolean,
  halfActionBranchId: BranchId | undefined,
): GameLoopState {
  const player = getCurrentPlayer(state.order);
  const context = buildContext(
    state.world, address, player, state.order, plugin, tools,
    isHalfAction, halfActionBranchId,
  );

  const validation = plugin.actionValidator.validate(action, context);
  if (!validation.valid) {
    throw new Error(`Invalid action: ${validation.reason ?? 'unknown reason'}`);
  }

  const result: ActionResult = plugin.actionEvaluator.evaluate(action, context);
  let world = applyResultToWorld(state.world, address, result);

  // Check for branch trigger
  let branchTree = state.branchTree;
  let windows = state.windows;

  if (result.success && plugin.branchTrigger.shouldBranch(action, result, context)) {
    const originAddress = plugin.branchTrigger.getBranchOrigin(action, result, context);
    const branchId = `branch-${action.id}` as BranchId;
    const pending = {
      id: branchId,
      originAddress,
      triggerActionId: action.id,
      initiatedBy: player,
      originColumnPlayer: player,
      crystallized: false,
      crystallizedAtGlobalTurn: undefined,
      crystallizedTimelineId: undefined,
    };

    branchTree = createPendingBranch(branchTree, pending);
    world = addPendingBranch(world, pending);

    // Track initiator as party on the pending board
    const originBoard = getBoardAt(world, originAddress);
    if (originBoard) {
      const updatedBoard = addParty(originBoard, player);
      world = { ...world, boards: new Map(world.boards).set(boardKey(originAddress), updatedBoard) };
    }

    // Open sliding window
    const n = state.order.priorityQueue.length;
    const halfActionBoards = computeHalfActionBoards([address], originAddress);
    const window = openWindow(
      branchId,
      player,
      player,
      state.order.globalTurn,
      n,
      plugin.windowMode,
      halfActionBoards,
    );
    windows = new Map(windows).set(branchId, window);
  }

  return { ...state, world, branchTree, windows };
}

/**
 * Crystallizes all windows that are due to close on the current global turn.
 * In n+0.5 mode, fires the half-action callback before crystallizing.
 */
export function crystallizeDueWindows(
  state: GameLoopState,
  plugin: IGameDefinition,
  tools: EngineTools,
  onHalfAction: (state: GameLoopState, window: BranchWindow) => GameLoopState,
  nextTimelineId: () => string,
): GameLoopState {
  let current = state;

  for (const [branchId, window] of current.windows) {
    if (!shouldClose(window, current.order.globalTurn)) continue;

    // n+0.5: fire half-action before crystallization
    if (isHalfActionPending(window)) {
      current = onHalfAction(current, window);
      const updatedWindow = markHalfActionUsed(window);
      const windows = new Map(current.windows).set(branchId, updatedWindow);
      current = { ...current, windows };
    }

    // Crystallize
    const newTimelineId = nextTimelineId() as ReturnType<typeof nextTimelineId> & string;
    const globalTurn = current.order.globalTurn as Turn;
    const branchTree = crystallizeBranch(current.branchTree, branchId, newTimelineId as any, globalTurn);

    // Update the pending branch in world state
    const updatedPending = branchTree.pendingBranches[branchId];
    if (!updatedPending) throw new Error(`Branch missing after crystallize: ${branchId}`);
    const world = updatePendingBranch(current.world, updatedPending);

    // Close the window
    const windows = new Map(current.windows);
    windows.delete(branchId);

    current = { ...current, branchTree, world, windows };
  }

  return current;
}

/**
 * Checks win condition and returns the winner, or null if the game continues.
 */
export function checkWinCondition(state: GameLoopState, plugin: IGameDefinition): PlayerId | null {
  return plugin.winCondition.evaluate(state.world);
}

/**
 * Advances to the next player, or if the global turn is complete, advances
 * the global turn and crystallizes any due windows.
 */
export function advanceTurn(
  state: GameLoopState,
  plugin: IGameDefinition,
  tools: EngineTools,
  onHalfAction: (state: GameLoopState, window: BranchWindow) => GameLoopState,
  nextTimelineId: () => string,
): GameLoopState {
  const nextOrder = advancePlayer(state.order);

  if (nextOrder === null) {
    // Global turn complete — rotate priority and crystallize due windows
    const rotated = advanceGlobalTurn(state.order);
    const advanced = { ...state, order: rotated };
    return crystallizeDueWindows(advanced, plugin, tools, onHalfAction, nextTimelineId);
  }

  return { ...state, order: nextOrder };
}
