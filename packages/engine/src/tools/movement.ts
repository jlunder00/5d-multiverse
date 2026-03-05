import {
  MovementTools,
  BoardAddress,
  Location,
  RegionId,
  PlayerId,
  AdjacencyMode,
  MovementSpec,
  StepCounts,
  BranchTree,
  WorldState,
  boardKey,
} from '@5d/types';
import {
  getAncestorPath,
  getLateralIntermediateBoards,
  getIntermediateTimelines,
} from '../branch-tree.js';

/**
 * Builds the MovementTools implementation.
 *
 * @param spatialAdjacencyFn - Delegates to the plugin's IMapLoader.getAdjacentRegions
 *                             for spatial adjacency queries.
 */
export function createMovementTools(
  spatialAdjacencyFn: (regionId: RegionId) => RegionId[],
): MovementTools {
  return {
    isTemporallyReachable(
      from: BoardAddress,
      to: BoardAddress,
      adjacencyMode: AdjacencyMode,
      branchTree: BranchTree,
    ): boolean {
      // Must be on the same timeline for temporal movement
      if (from.timeline !== to.timeline) return false;
      // Cannot move to the same turn
      if (from.turn === to.turn) return false;
      // Can only move to the past (to.turn < from.turn)
      if (to.turn >= from.turn) return false;

      if (adjacencyMode === 'strict') {
        // Every intermediate turn must have a played board on this timeline
        const node = branchTree.nodes[from.timeline];
        if (!node) return false;
        // In strict mode we require the destination board to exist in the tree.
        // The world state holds the actual boards; here we check tree topology only.
        // We verify the timeline exists and the destination turn is >= divergedAtTurn.
        const divergedAt = node.divergedAtTurn ?? 1;
        return to.turn >= divergedAt;
      }

      // loose: unplayed future/past states are reachable — just need timeline to exist
      return !!branchTree.nodes[from.timeline];
    },

    isLaterallyReachable(
      from: BoardAddress,
      to: BoardAddress,
      adjacencyMode: AdjacencyMode,
      branchTree: BranchTree,
    ): boolean {
      // Must be at the same turn for lateral movement
      if (from.turn !== to.turn) return false;
      if (from.timeline === to.timeline) return false;

      // Both timelines must exist in the tree
      if (!branchTree.nodes[from.timeline] || !branchTree.nodes[to.timeline]) return false;

      if (adjacencyMode === 'strict') {
        // All intermediate timelines must have played boards at this turn.
        // We check that all timelines along the path exist in the tree.
        const intermediates = getIntermediateTimelines(branchTree, from.timeline, to.timeline);
        for (const timelineId of intermediates) {
          if (!branchTree.nodes[timelineId]) return false;
        }
        return true;
      }

      // loose: gaps in intermediate timelines are allowed
      return true;
    },

    getIntermediateStates(
      from: BoardAddress,
      to: BoardAddress,
      branchTree: BranchTree,
    ): BoardAddress[] {
      return getLateralIntermediateBoards(branchTree, from, to);
    },

    isControlledBy(location: Location, playerId: PlayerId, world: WorldState): boolean {
      const key = boardKey({ timeline: location.timeline, turn: location.turn });
      const board = world.boards.get(key);
      if (!board) return false;
      const region = board.regions.get(location.region);
      if (!region) return false;
      return region.owner === playerId;
    },

    isSpatiallyAdjacent(a: RegionId, b: RegionId): boolean {
      return spatialAdjacencyFn(a).includes(b);
    },

    computeStepCounts(spec: MovementSpec): StepCounts {
      let spatial = 0;
      let temporal = 0;
      let lateral = 0;
      for (const step of spec.steps) {
        if (step.type === 'spatial') spatial++;
        else if (step.type === 'temporal') temporal++;
        else if (step.type === 'lateral') lateral++;
      }
      return { spatial, temporal, lateral, total: spatial + temporal + lateral };
    },
  };
}
