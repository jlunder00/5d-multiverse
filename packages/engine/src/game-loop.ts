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
import { getBoardAt, applyResultToWorld, addPendingBranch, updatePendingBranch, setBoard } from './world-state.js';
import { getCurrentPlayer, advanceGlobalTurn } from './execution-order.js';
import { openWindow, shouldClose, isHalfActionPending, markHalfActionUsed, computeHalfActionBoards } from './window-manager.js';
import { createPendingBranch, crystallizeBranch } from './branch-tree.js';
import { addParty } from './information-model.js';
import { BranchTree, BranchWindow, Turn, TimelineId, PendingBranch } from '@5d/types';

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

  // Capture moving entity BEFORE applyResultToWorld removes it from the source board
  const movingEntity = action.entityId
    ? getBoardAt(state.world, address)?.entities.get(action.entityId)
    : undefined;

  const result: ActionResult = plugin.actionEvaluator.evaluate(action, context);
  let world = applyResultToWorld(state.world, address, result);

  // Check for branch trigger
  let branchTree = state.branchTree;
  let windows = state.windows;

  if (result.success && plugin.branchTrigger.shouldBranch(action, result, context)) {
    const originAddress = plugin.branchTrigger.getBranchOrigin(action, result, context);

    // Check for existing branch at this origin (subsequent arrival)
    const existingBranch = [...world.pendingBranches.values()].find(
      (b) =>
        b.originAddress.timeline === originAddress.timeline &&
        b.originAddress.turn === originAddress.turn &&
        !b.crystallized,
    );

    if (existingBranch?.crystallizedTimelineId) {
      // Add entity to existing ghost board
      if (movingEntity) {
        const ghostAddress = { timeline: existingBranch.crystallizedTimelineId, turn: originAddress.turn };
        const ghostBoard = getBoardAt(world, ghostAddress);
        if (ghostBoard) {
          const entities = new Map(ghostBoard.entities);
          entities.set(movingEntity.id, {
            ...movingEntity,
            location: { timeline: existingBranch.crystallizedTimelineId, turn: originAddress.turn, region: action.to.region },
          });
          world = setBoard(world, addParty({ ...ghostBoard, entities }, player));
        }
      }
    } else {
      // New branch — pre-assign the pending timeline ID
      const branchId = `branch-${action.id}` as BranchId;
      const pendingTimelineId = `TL-${branchId}` as TimelineId;
      const pending: PendingBranch = {
        id: branchId,
        originAddress,
        triggerActionId: action.id,
        initiatedBy: player,
        originColumnPlayer: player,
        crystallized: false,
        crystallizedTimelineId: pendingTimelineId,
      };

      branchTree = createPendingBranch(branchTree, pending);
      world = addPendingBranch(world, pending);

      // Create ghost board copied from origin board
      const originBoard = getBoardAt(world, originAddress);
      if (originBoard) {
        const entities = new Map(originBoard.entities);
        if (movingEntity) {
          entities.set(movingEntity.id, {
            ...movingEntity,
            location: { timeline: pendingTimelineId, turn: originAddress.turn, region: action.to.region },
          });
        }
        world = setBoard(world, addParty({
          ...originBoard,
          address: { timeline: pendingTimelineId, turn: originAddress.turn },
          entities,
          pluginData: { ...originBoard.pluginData, isPendingBranch: true, originAddress },
        }, player));
      }

      // Open sliding window
      const window = openWindow(
        branchId,
        player,
        player,
        state.order.globalTurn,
        state.order.priorityQueue.length,
        plugin.windowMode,
        computeHalfActionBoards([address], originAddress),
      );
      windows = new Map(windows).set(branchId, window);
    }
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

    // Crystallize using pre-assigned ID (nextTimelineId ignored)
    const pendingBranch = current.world.pendingBranches.get(branchId);
    if (!pendingBranch?.crystallizedTimelineId)
      throw new Error(`No crystallizedTimelineId on branch ${branchId}`);
    const newTimelineId = pendingBranch.crystallizedTimelineId;
    const globalTurn = current.order.globalTurn as Turn;
    const branchTree = crystallizeBranch(current.branchTree, branchId, newTimelineId, globalTurn);
    let world = updatePendingBranch(current.world, branchTree.pendingBranches[branchId]!);

    // Strip isPendingBranch flag from ghost board
    const ghostAddress = { timeline: newTimelineId, turn: pendingBranch.originAddress.turn };
    const ghostBoard = getBoardAt(world, ghostAddress);
    if (ghostBoard) {
      const { isPendingBranch: _a, originAddress: _b, ...rest } = ghostBoard.pluginData as Record<string, unknown>;
      world = setBoard(world, { ...ghostBoard, pluginData: rest });
    }

    // Create catch-up boards from originTurn+1 to currentGlobalTurn
    for (let t = (pendingBranch.originAddress.turn as number) + 1; t <= (globalTurn as number); t++) {
      const prev = getBoardAt(world, { timeline: newTimelineId, turn: (t - 1) as Turn });
      if (prev) {
        const turn = t as Turn;
        world = setBoard(world, {
          ...prev,
          address: { timeline: newTimelineId, turn },
          entities: new Map([...prev.entities].map(([id, e]) => [id, { ...e, location: { ...e.location, turn } }])),
        });
      }
    }

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
 * Advances the global turn and crystallizes any due windows.
 */
export function advanceTurn(
  state: GameLoopState,
  plugin: IGameDefinition,
  tools: EngineTools,
  onHalfAction: (state: GameLoopState, window: BranchWindow) => GameLoopState,
  nextTimelineId: () => string,
): GameLoopState {
  const order = advanceGlobalTurn(state.order);
  return crystallizeDueWindows({ ...state, order }, plugin, tools, onHalfAction, nextTimelineId);
}
