import {
  BranchTree,
  BranchNode,
  BranchId,
  TimelineId,
  BoardAddress,
  Turn,
  IGameDefinition,
} from '@5d/types';

export function createRootTimeline(rootTimelineId: TimelineId): BranchTree {
  const rootNode: BranchNode = {
    timelineId: rootTimelineId,
    parentTimelineId: null,
    divergedAtTurn: null,
    divergedByActionId: null,
    children: [],
    // Root timeline: no stabilization period — it begins already crystallized.
    // The server may update this for a real TL0 stabilization window.
    stabilizationPeriodTurns: 0,
    crystallizesAtGlobalTurn: 0 as Turn,
    inStabilizationPeriod: false,
    originAddress: null,
    initiatedBy: null,
    originColumnPlayer: null,
    triggerActionId: null,
  };
  return {
    rootTimelineId,
    nodes: { [rootTimelineId]: rootNode },
  };
}

/** Adds a new BranchNode to the tree and wires it to its parent's children list. */
export function createBranch(
  tree: BranchTree,
  branchNode: BranchNode,
): BranchTree {
  const parentId = branchNode.parentTimelineId;
  if (!parentId) throw new Error('createBranch: branchNode must have a parentTimelineId');

  const parentNode = tree.nodes[parentId];
  if (!parentNode) throw new Error(`Parent timeline not found: ${parentId}`);

  const updatedParent: BranchNode = {
    ...parentNode,
    children: [...parentNode.children, branchNode.timelineId],
  };

  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [parentId]: updatedParent,
      [branchNode.timelineId]: branchNode,
    },
  };
}

/**
 * Crystallizes a timeline: clears `inStabilizationPeriod` on its node.
 * No board manipulation — boards already exist from `advanceAllTimelines`.
 */
export function crystallizeBranch(
  tree: BranchTree,
  timelineId: TimelineId,
): BranchTree {
  const node = tree.nodes[timelineId];
  if (!node) throw new Error(`Timeline not found: ${timelineId}`);
  if (!node.inStabilizationPeriod) return tree; // already crystallized

  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [timelineId]: { ...node, inStabilizationPeriod: false },
    },
  };
}

/**
 * Returns true if the given timeline is still within its stabilization period.
 */
export function isInStabilizationPeriod(
  tree: BranchTree,
  timelineId: TimelineId,
): boolean {
  const node = tree.nodes[timelineId];
  return node?.inStabilizationPeriod ?? false;
}

/**
 * Returns true if the given turn on the given timeline is reachable for time travel.
 *
 * Formation-window turns are those that existed during the timeline's stabilization
 * period. For a branch, these are turns (divergedAtTurn+1)..(divergedAtTurn+stabilizationPeriodTurns).
 * For TL0 (no parent), these are turns 1..stabilizationPeriodTurns.
 *
 * Whether formation-window turns are reachable after crystallization is controlled
 * by plugin settings: `tl0StabilizationReachable` (for TL0) and
 * `branchStabilizationReachable` (for all other timelines).
 *
 * Returns false if the timeline is still in its stabilization period (not yet traversable).
 * Returns true for any turn outside the formation window.
 */
export function isFormationWindowReachable(
  tree: BranchTree,
  timelineId: TimelineId,
  turn: Turn,
  plugin: Pick<IGameDefinition, 'tl0StabilizationReachable' | 'branchStabilizationReachable'>,
): boolean {
  const node = tree.nodes[timelineId];
  if (!node) return true; // unknown timeline — let engine/plugin handle separately
  if (node.inStabilizationPeriod) return false; // still stabilizing

  const isRoot = node.parentTimelineId === null;
  const formationStart = isRoot ? 1 : (node.divergedAtTurn as number) + 1;
  const formationEnd = formationStart + node.stabilizationPeriodTurns - 1;

  if ((turn as number) < formationStart || (turn as number) > formationEnd) {
    return true; // outside formation window — always reachable
  }

  return isRoot ? plugin.tl0StabilizationReachable : plugin.branchStabilizationReachable;
}

/**
 * Finds the BranchNode for a branch whose originAddress matches the given address.
 * Used to detect subsequent arrivals to an in-window timeline.
 */
export function findBranchByOrigin(
  tree: BranchTree,
  originAddress: BoardAddress,
): BranchNode | undefined {
  return Object.values(tree.nodes).find(
    (node) =>
      node.inStabilizationPeriod &&
      node.originAddress?.timeline === originAddress.timeline &&
      node.originAddress?.turn === originAddress.turn,
  );
}

/**
 * Returns the ordered path of BranchNodes from the root down to the given
 * timeline (inclusive). Useful for lateral reachability checks.
 */
export function getAncestorPath(tree: BranchTree, timelineId: TimelineId): BranchNode[] {
  const path: BranchNode[] = [];
  let current: TimelineId | null = timelineId;
  while (current !== null) {
    const node: BranchNode | undefined = tree.nodes[current];
    if (!node) throw new Error(`Timeline not found: ${current}`);
    path.unshift(node);
    current = node.parentTimelineId;
  }
  return path;
}

/**
 * Returns the lowest common ancestor timeline of two timelines.
 */
export function lowestCommonAncestor(
  tree: BranchTree,
  a: TimelineId,
  b: TimelineId,
): TimelineId {
  const ancestorsA = new Set(getAncestorPath(tree, a).map((n) => n.timelineId));
  let current: TimelineId | null = b;
  while (current !== null) {
    if (ancestorsA.has(current)) return current;
    const node: BranchNode | undefined = tree.nodes[current];
    if (!node) throw new Error(`Timeline not found: ${current}`);
    current = node.parentTimelineId;
  }
  throw new Error(`No common ancestor between ${a} and ${b}`);
}

/**
 * Returns the existing (played) board addresses along the lateral path between
 * two timelines at the given turn number.
 */
export function getIntermediateTimelines(
  tree: BranchTree,
  from: TimelineId,
  to: TimelineId,
): TimelineId[] {
  if (from === to) return [];

  const pathFrom = getAncestorPath(tree, from).map((n) => n.timelineId);
  const pathTo = getAncestorPath(tree, to).map((n) => n.timelineId);

  const setFrom = new Set(pathFrom);
  let lcaIndex = pathTo.findIndex((id) => setFrom.has(id));
  if (lcaIndex === -1) throw new Error(`No common ancestor between ${from} and ${to}`);
  const lca = pathTo[lcaIndex]!;

  const fromToLca = pathFrom.slice(pathFrom.indexOf(lca) + 1).reverse();
  const lcaToTo = pathTo.slice(lcaIndex + 1);

  return [...fromToLca, lca, ...lcaToTo].filter((id) => id !== from && id !== to);
}

/**
 * Returns BoardAddresses for the intermediate boards along the lateral path,
 * at the given turn. Excludes the from and to endpoints.
 */
export function getLateralIntermediateBoards(
  tree: BranchTree,
  from: BoardAddress,
  to: BoardAddress,
): BoardAddress[] {
  const intermediateTimelines = getIntermediateTimelines(tree, from.timeline, to.timeline);
  const turn = from.turn as Turn;
  return intermediateTimelines.map((timeline) => ({ timeline, turn }));
}
