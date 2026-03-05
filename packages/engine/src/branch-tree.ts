import {
  BranchTree,
  BranchNode,
  BranchId,
  PendingBranch,
  TimelineId,
  BoardAddress,
  Turn,
} from '@5d/types';

export function createRootTimeline(rootTimelineId: TimelineId): BranchTree {
  const rootNode: BranchNode = {
    timelineId: rootTimelineId,
    parentTimelineId: null,
    divergedAtTurn: null,
    divergedByActionId: null,
    children: [],
  };
  return {
    rootTimelineId,
    nodes: { [rootTimelineId]: rootNode },
    pendingBranches: {},
  };
}

export function createPendingBranch(
  tree: BranchTree,
  branch: PendingBranch,
): BranchTree {
  return {
    ...tree,
    pendingBranches: {
      ...tree.pendingBranches,
      [branch.id]: branch,
    },
  };
}

/**
 * Crystallizes a pending branch: marks it as crystallized, creates a new
 * BranchNode for the new timeline, and wires it into its parent.
 */
export function crystallizeBranch(
  tree: BranchTree,
  branchId: BranchId,
  newTimelineId: TimelineId,
  crystallizedAtGlobalTurn: Turn,
): BranchTree {
  const pending = tree.pendingBranches[branchId];
  if (!pending) throw new Error(`No pending branch: ${branchId}`);
  if (pending.crystallized) throw new Error(`Branch already crystallized: ${branchId}`);

  const parentTimelineId = pending.originAddress.timeline;
  const parentNode = tree.nodes[parentTimelineId];
  if (!parentNode) throw new Error(`Parent timeline not found: ${parentTimelineId}`);

  const newNode: BranchNode = {
    timelineId: newTimelineId,
    parentTimelineId,
    divergedAtTurn: pending.originAddress.turn,
    divergedByActionId: pending.triggerActionId,
    children: [],
  };

  const updatedParent: BranchNode = {
    ...parentNode,
    children: [...parentNode.children, newTimelineId],
  };

  const updatedPending: PendingBranch = {
    ...pending,
    crystallized: true,
    crystallizedAtGlobalTurn,
    crystallizedTimelineId: newTimelineId,
  };

  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [parentTimelineId]: updatedParent,
      [newTimelineId]: newNode,
    },
    pendingBranches: {
      ...tree.pendingBranches,
      [branchId]: updatedPending,
    },
  };
}

/**
 * Returns the ordered path of BranchNodes from the root down to the given
 * timeline (inclusive). Useful for lateral reachability checks.
 */
export function getAncestorPath(tree: BranchTree, timelineId: TimelineId): BranchNode[] {
  const path: BranchNode[] = [];
  let current: TimelineId | null = timelineId;
  while (current !== null) {
    const node = tree.nodes[current];
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
    const node = tree.nodes[current];
    if (!node) throw new Error(`Timeline not found: ${current}`);
    current = node.parentTimelineId;
  }
  throw new Error(`No common ancestor between ${a} and ${b}`);
}

/**
 * Returns the existing (played) board addresses along the lateral path between
 * two timelines at the given turn number.
 *
 * The path goes: from.timeline → LCA → to.timeline. Only includes boards at
 * timelines that have actually been played (i.e. exist in the world state).
 * The caller filters by existing boards since branch-tree only knows topology.
 *
 * Returns the ordered list of intermediate timeline IDs (excluding from and to).
 */
export function getIntermediateTimelines(
  tree: BranchTree,
  from: TimelineId,
  to: TimelineId,
): TimelineId[] {
  if (from === to) return [];

  const pathFrom = getAncestorPath(tree, from).map((n) => n.timelineId);
  const pathTo = getAncestorPath(tree, to).map((n) => n.timelineId);

  // Find LCA index in each path
  const setFrom = new Set(pathFrom);
  let lcaIndex = pathTo.findIndex((id) => setFrom.has(id));
  if (lcaIndex === -1) throw new Error(`No common ancestor between ${from} and ${to}`);
  const lca = pathTo[lcaIndex]!;

  // pathFrom goes root→from; upward segment is from→lca (reversed)
  const fromToLca = pathFrom.slice(pathFrom.indexOf(lca) + 1).reverse();
  // pathTo goes root→to; downward segment is lca→to
  const lcaToTo = pathTo.slice(lcaIndex + 1);

  // Full path from→lca→to, excluding endpoints
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
  // Use the turn from `from` — lateral moves stay at the same turn
  const turn = from.turn as Turn;
  return intermediateTimelines.map((timeline) => ({ timeline, turn }));
}
