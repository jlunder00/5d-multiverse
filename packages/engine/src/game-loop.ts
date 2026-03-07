import {
  IGameDefinition,
  WorldState,
  Board,
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
import { getBoardAt, applyResultToWorld, setBoard } from './world-state.js';
import { getCurrentPlayer, advanceGlobalTurn } from './execution-order.js';
import { openWindow, shouldClose, isHalfActionPending, markHalfActionUsed, computeHalfActionBoards } from './window-manager.js';
import { createBranch, crystallizeBranch, findBranchByOrigin, isInStabilizationPeriod, isFormationWindowReachable } from './branch-tree.js';
import { addParty } from './information-model.js';
import { BranchTree, BranchNode, BranchWindow, Turn, TimelineId, EntityId } from '@5d/types';

export interface GameLoopState {
  world: WorldState;
  order: ExecutionOrder;
  branchTree: BranchTree;
  /** Open sliding windows keyed by branchId (= timelineId string value). */
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

  // Engine invariant: cannot target a stabilizing timeline unless it is a direct
  // subsequent arrival from that timeline's parent (direct addressing model).
  // Direct arrivals from the parent also bypass formation-window checks.
  const destNodeForChecks = state.branchTree.nodes[action.to.timeline as string];
  const isDirectArrivalFromParent =
    destNodeForChecks?.inStabilizationPeriod === true &&
    destNodeForChecks.parentTimelineId === (address.timeline as string);

  // Cross-board checks only apply when action.to refers to a different board than the
  // submitted-on board. Intra-board actions (e.g. spatial moves) must not be subject
  // to time-travel or reachability checks.
  const isCrossBoard =
    (action.to.timeline as string) !== (address.timeline as string) ||
    (action.to.turn as number) !== (address.turn as number);

  if (!isDirectArrivalFromParent && isCrossBoard) {
    // Temporal+lateral: crossing both timeline and turn in one action is disallowed.
    const isCrossTimeline = (action.to.timeline as string) !== (address.timeline as string);
    const isCrossTurn = (action.to.turn as number) !== (address.turn as number);
    if (isCrossTimeline && isCrossTurn) {
      throw new Error(
        `Cannot submit action: temporal+lateral moves (crossing both timeline and turn boundary) are not allowed`,
      );
    }

    if (isInStabilizationPeriod(state.branchTree, action.to.timeline as TimelineId)) {
      throw new Error(
        `Cannot submit action: destination timeline ${action.to.timeline as string} is currently in its stabilization period`,
      );
    }

    // Formation-window reachability: turns within a crystallized timeline's stabilization
    // period may be permanently unreachable depending on plugin settings.
    if (!isFormationWindowReachable(state.branchTree, action.to.timeline as TimelineId, action.to.turn as Turn, plugin)) {
      throw new Error(
        `Cannot submit action: turn ${action.to.turn as number} on timeline ${action.to.timeline as string} is a formation-window turn and is not reachable after crystallization`,
      );
    }
  }

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

  let branchTree = state.branchTree;
  let windows = state.windows;

  // If the destination is already a stabilizing timeline (direct addressing), insert
  // the entity there without triggering a new branch.
  const directStabilizingNode = branchTree.nodes[action.to.timeline as string];
  if (result.success && directStabilizingNode?.inStabilizationPeriod) {
    if (movingEntity) {
      const destBoard = getBoardAt(world, { timeline: directStabilizingNode.timelineId, turn: action.to.turn as Turn });
      if (destBoard) {
        const arrivedId = `${movingEntity.id}-arr-${action.id}` as EntityId;
        const entities = new Map(destBoard.entities);
        entities.set(arrivedId, {
          ...movingEntity,
          id: arrivedId,
          location: { ...action.to },
        });
        world = setBoard(world, addParty({ ...destBoard, entities }, player));
      }
    }
  } else if (result.success && plugin.branchTrigger.shouldBranch(action, result, context)) {
    const originAddress = plugin.branchTrigger.getBranchOrigin(action, result, context);

    // Check for an in-window timeline whose origin matches this action's destination
    const existingBranchNode = findBranchByOrigin(branchTree, originAddress);

    if (existingBranchNode) {
      // Subsequent arrival via origin address: bootstrap-paradox duplicate — historical
      // copy stays, arriving piece inserted under a new entity ID so both coexist.
      if (movingEntity) {
        // Board is at originAddress.turn (the timestep the piece came from)
        const stabilizationStartTurn = originAddress.turn as Turn;
        const destAddress = { timeline: existingBranchNode.timelineId, turn: stabilizationStartTurn };
        const destBoard = getBoardAt(world, destAddress);
        if (destBoard) {
          const arrivedId = `${movingEntity.id}-arr-${action.id}` as EntityId;
          const entities = new Map(destBoard.entities);
          entities.set(arrivedId, {
            ...movingEntity,
            id: arrivedId,
            location: { timeline: existingBranchNode.timelineId, turn: stabilizationStartTurn, region: action.to.region },
          });
          world = setBoard(world, addParty({ ...destBoard, entities }, player));
        }
      }
    } else {
      // New branch — pre-assign the timeline ID (= branchId)
      const newTimelineId = `TL-branch-${action.id}` as TimelineId;
      const branchId = newTimelineId as unknown as BranchId;

      // The first board of the new timeline is at originAddress.turn — the timestep
      // the piece came from. The timeline then advances naturally via advanceAllTimelines.
      const stabilizationStartTurn = originAddress.turn as Turn;
      const nPlayers = state.order.priorityQueue.length;

      const newNode: BranchNode = {
        timelineId: newTimelineId,
        parentTimelineId: originAddress.timeline,
        divergedAtTurn: originAddress.turn,
        divergedByActionId: action.id,
        children: [],
        stabilizationPeriodTurns: nPlayers,
        crystallizesAtGlobalTurn: ((state.order.globalTurn as number) + nPlayers) as Turn,
        inStabilizationPeriod: true,
        originAddress,
        initiatedBy: player,
        originColumnPlayer: player,
        triggerActionId: action.id,
      };

      branchTree = createBranch(branchTree, newNode);

      // Create the first board of the new timeline, copied from origin board.
      // Historical entities are preserved (bootstrap paradox — both the historical
      // copy and the arrived copy coexist). The arriving piece gets a new entity ID.
      const originBoard = getBoardAt(world, originAddress);
      if (originBoard) {
        const entities = new Map(originBoard.entities);
        if (movingEntity) {
          const arrivedId = `${movingEntity.id}-arr-${action.id}` as EntityId;
          entities.set(arrivedId, {
            ...movingEntity,
            id: arrivedId,
            location: { timeline: newTimelineId, turn: stabilizationStartTurn, region: action.to.region },
          });
        }
        world = setBoard(world, addParty({
          ...originBoard,
          address: { timeline: newTimelineId, turn: stabilizationStartTurn },
          entities,
          pluginData: { ...originBoard.pluginData },
        }, player));
      }

      // Open sliding window (branchId = newTimelineId as string)
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
  _nextTimelineId: () => string,
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

    // branchId string value equals the timelineId string value
    const timelineId = branchId as unknown as TimelineId;
    const globalTurn = current.order.globalTurn as Turn;
    const branchTree = crystallizeBranch(current.branchTree, timelineId);

    // Close the window
    const windows = new Map(current.windows);
    windows.delete(branchId);

    current = { ...current, branchTree, windows };
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
 * Copies each timeline's latest board forward by one turn.
 * Must be called on every endTurn so all timelines — including stabilization-period
 * ones — advance in lockstep with the main timeline.
 */
export function advanceAllTimelines(world: WorldState): WorldState {
  const latestPerTimeline = new Map<string, Board>();
  for (const [, board] of world.boards) {
    const tl = board.address.timeline as string;
    const cur = latestPerTimeline.get(tl);
    if (!cur || (board.address.turn as number) > (cur.address.turn as number)) {
      latestPerTimeline.set(tl, board);
    }
  }
  let result = world;
  for (const board of latestPerTimeline.values()) {
    const nextTurn = ((board.address.turn as number) + 1) as Turn;
    result = setBoard(result, {
      ...board,
      address: { ...board.address, turn: nextTurn },
      entities: new Map([...board.entities].map(([id, e]) => [id, { ...e, location: { ...e.location, turn: nextTurn } }])),
    });
  }
  return result;
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
