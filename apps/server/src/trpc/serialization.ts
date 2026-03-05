import {
  WorldState,
  Board,
  BranchTree,
  BranchWindow,
  BranchId,
  BoardAddress,
  RegionId,
  EntityId,
  PlayerId,
  boardKey,
} from '@5d/types';

/**
 * WorldState uses Maps internally. These helpers convert to/from JSON-safe
 * plain objects for storage and transport.
 */

type SerializedBoard = Omit<Board, 'regions' | 'entities' | 'economies'> & {
  regions: [string, unknown][];
  entities: [string, unknown][];
  economies: [string, unknown][];
};

type SerializedWorldState = {
  boards: [string, SerializedBoard][];
  pendingBranches: [string, unknown][];
};

export function serializeWorldState(world: WorldState): string {
  const boards: [string, SerializedBoard][] = [];
  for (const [key, board] of world.boards) {
    boards.push([key, {
      address: board.address,
      regions: [...board.regions.entries()],
      entities: [...board.entities.entries()],
      economies: [...board.economies.entries()],
      pluginData: board.pluginData,
    }]);
  }
  const pendingBranches: [string, unknown][] = [...world.pendingBranches.entries()];
  return JSON.stringify({ boards, pendingBranches } satisfies SerializedWorldState);
}

export function deserializeWorldState(json: string): WorldState {
  const raw = JSON.parse(json) as SerializedWorldState;
  const boards = new Map<string, Board>();
  for (const [key, sb] of raw.boards) {
    const board: Board = {
      address: sb.address,
      regions: new Map(sb.regions as [RegionId, Board['regions'] extends Map<infer _K, infer V> ? V : never][]),
      entities: new Map(sb.entities as [EntityId, Board['entities'] extends Map<infer _K, infer V> ? V : never][]),
      economies: new Map(sb.economies as [PlayerId, Board['economies'] extends Map<infer _K, infer V> ? V : never][]),
      pluginData: sb.pluginData,
    };
    boards.set(key, board);
  }
  const pendingBranches = new Map(raw.pendingBranches as [BranchId, WorldState['pendingBranches'] extends Map<infer _K, infer V> ? V : never][]);
  return { boards, pendingBranches };
}

export function serializeBranchTree(tree: BranchTree): string {
  return JSON.stringify(tree);
}

export function deserializeBranchTree(json: string): BranchTree {
  return JSON.parse(json) as BranchTree;
}

export function serializeWindows(windows: Map<BranchId, BranchWindow>): string {
  return JSON.stringify([...windows.entries()]);
}

export function deserializeWindows(json: string): Map<BranchId, BranchWindow> {
  const entries = JSON.parse(json) as [BranchId, BranchWindow][];
  return new Map(entries);
}
