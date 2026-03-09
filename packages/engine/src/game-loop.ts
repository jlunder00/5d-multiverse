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
  PieceStore,
  RealPieceId,
  boardKey,
} from '@5d/types';
import { getBoardAt, applyResultToWorld, setBoard } from './world-state.js';
import { getCurrentPlayer, advanceGlobalTurn } from './execution-order.js';
import { openWindow, shouldClose, isHalfActionPending, markHalfActionUsed, computeHalfActionBoards } from './window-manager.js';
import { createBranch, crystallizeBranch, findBranchByOrigin, isInStabilizationPeriod, isFormationWindowReachable } from './branch-tree.js';
import { addParty } from './information-model.js';
import { BranchTree, BranchNode, BranchWindow, Turn, TimelineId } from '@5d/types';

export interface GameLoopState {
  world: WorldState;
  order: ExecutionOrder;
  branchTree: BranchTree;
  /** Open sliding windows keyed by branchId (= timelineId string value). */
  windows: Map<BranchId, BranchWindow>;
  /** Player declared winner, if any. */
  winner: PlayerId | null;
  /** Game identifier for PieceStore calls. */
  gameId: string;
  /** PieceStore for piece persistence. Undefined until Phase 4 wires the server. */
  pieceStore: PieceStore | undefined;
}

/**
 * Builds an ActionContext for the given board and player.
 * If a pieceStore is provided, populates board.pieces from the store.
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
  gameId: string,
  pieceStore: PieceStore | undefined,
): ActionContext {
  const board = getBoardAt(world, address);
  if (!board) throw new Error(`Board not found: ${boardKey(address)}`);
  const phase = plugin.turnPhases[0];
  if (!phase) throw new Error('Plugin has no turn phases');
  const pieces = pieceStore
    ? pieceStore.getPiecesOnBoard(gameId, address.timeline as string, address.turn as number)
    : board.pieces;
  return {
    board: { ...board, pieces },
    world,
    player,
    currentPhase: phase.id,
    tools,
    isHalfAction,
    halfActionBranchId,
    pieceStore,
    gameId,
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
  nextTimelineId?: () => string,
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
    isHalfAction, halfActionBranchId, state.gameId, state.pieceStore,
  );

  const validation = plugin.actionValidator.validate(action, context);
  if (!validation.valid) {
    throw new Error(`Invalid action: ${validation.reason ?? 'unknown reason'}`);
  }

  // Capture the moving piece BEFORE evaluation (store may be mutated by evaluator)
  const movingPiece = action.entityId && state.pieceStore
    ? state.pieceStore.getPieceState(state.gameId, action.entityId as RealPieceId)
    : undefined;
  const movingPieceLoc = movingPiece && state.pieceStore
    ? state.pieceStore.getPieceLocation(state.gameId, movingPiece.id)
    : undefined;

  const result: ActionResult = plugin.actionEvaluator.evaluate(action, context);
  let world = applyResultToWorld(state.world, address, result);

  let branchTree = state.branchTree;
  let windows = state.windows;

  // If the destination is already a stabilizing timeline (direct addressing), insert
  // the piece there without triggering a new branch.
  const directStabilizingNode = branchTree.nodes[action.to.timeline as string];
  if (result.success && directStabilizingNode?.inStabilizationPeriod) {
    if (movingPiece && movingPieceLoc && state.pieceStore) {
      const arrivedId = `${movingPiece.id}-arr-${action.id}` as RealPieceId;
      state.pieceStore.addPiece(state.gameId,
        { ...movingPiece, id: arrivedId },
        { ...movingPieceLoc,
          timeline: directStabilizingNode.timelineId as string,
          turn: action.to.turn as number,
          region: action.to.region,
        },
      );
    }
    // Update the dest board's parties list
    const destBoard = getBoardAt(world, { timeline: directStabilizingNode.timelineId, turn: action.to.turn as Turn });
    if (destBoard) {
      world = setBoard(world, addParty(destBoard, player));
    }
  } else if (result.success && plugin.branchTrigger.shouldBranch(action, result, context)) {
    const originAddress = plugin.branchTrigger.getBranchOrigin(action, result, context);

    // Check for an in-window timeline whose origin matches this action's destination
    const existingBranchNode = findBranchByOrigin(branchTree, originAddress);

    if (existingBranchNode) {
      // Subsequent arrival via origin address: bootstrap-paradox duplicate — historical
      // copy stays, arriving piece inserted under a new piece ID so both coexist.
      if (movingPiece && movingPieceLoc && state.pieceStore) {
        const stabilizationStartTurn = originAddress.turn as Turn;
        const arrivedId = `${movingPiece.id}-arr-${action.id}` as RealPieceId;
        state.pieceStore.addPiece(state.gameId,
          { ...movingPiece, id: arrivedId },
          { ...movingPieceLoc,
            timeline: existingBranchNode.timelineId as string,
            turn: stabilizationStartTurn,
            region: action.to.region,
          },
        );
      }
      // Update the dest board's parties list
      const stabilizationStartTurn = originAddress.turn as Turn;
      const destBoard = getBoardAt(world, { timeline: existingBranchNode.timelineId, turn: stabilizationStartTurn });
      if (destBoard) {
        world = setBoard(world, addParty(destBoard, player));
      }
    } else {
      // New branch — pre-assign the timeline ID (= branchId)
      const newTimelineId = (nextTimelineId ? nextTimelineId() : `TL-branch-${action.id}`) as TimelineId;
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

      // Create the first board of the new timeline in WorldState (for board-address routing).
      // Piece data is bootstrapped via PieceStore.createBranch() below.
      const originBoard = getBoardAt(world, originAddress);
      if (originBoard) {
        world = setBoard(world, addParty({
          ...originBoard,
          address: { timeline: newTimelineId, turn: stabilizationStartTurn },
          pieces: [],
          pluginData: { ...originBoard.pluginData },
        }, player));
      }

      // Bootstrap piece state in the store: copy historical snapshot, remove traveler
      // from source, place traveler at destination region.
      if (state.pieceStore && action.entityId) {
        state.pieceStore.createBranch(state.gameId, {
          originTimeline: originAddress.timeline as string,
          originTurn: originAddress.turn as number,
          newTimelineId: newTimelineId as string,
          travelerId: action.entityId as RealPieceId,
          travelerDestRegion: action.to.region,
        });
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
 * If pieceStore and gameId are provided, also delegates piece advancement to the store.
 */
export function advanceAllTimelines(
  world: WorldState,
  pieceStore?: PieceStore,
  gameId?: string,
): WorldState {
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
      pieces: [],
    });
  }

  // Delegate piece advancement to the store (snapshots current board → history, advances turns)
  if (pieceStore && gameId) {
    const timelines = [...latestPerTimeline.entries()].map(([tl, board]) => ({
      timeline: tl,
      fromTurn: board.address.turn as number,
    }));
    pieceStore.advanceAllTimelines(gameId, timelines);
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
