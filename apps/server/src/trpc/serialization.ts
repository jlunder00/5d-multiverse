import {
  WorldState,
  Board,
  BranchTree,
  BranchWindow,
  BranchId,
  RegionId,
  PlayerId,
  boardKey,
} from '@5d/types';

/**
 * WorldState uses Maps internally. These helpers convert to/from JSON-safe
 * plain objects for storage and transport.
 *
 * Phase 1 bridge: boards still carry a runtime `entities` Map as an untyped
 * field alongside the new typed `pieces: PieceInfo[]`. Serialization preserves
 * entities for backward compat. Phase 4 will remove entity serialization.
 */

type SerializedBoard = Omit<Board, 'regions' | 'pieces' | 'economies'> & {
  regions: [string, unknown][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: [string, unknown][];   // runtime bridge — not in Board type
  pieces: unknown[];
  economies: [string, unknown][];
};

type SerializedWorldState = {
  boards: [string, SerializedBoard][];
};

export function serializeWorldState(world: WorldState): string {
  const boards: [string, SerializedBoard][] = [];
  for (const [key, board] of world.boards) {
    boards.push([key, {
      address: board.address,
      regions: [...board.regions.entries()],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entities: [...((board as any).entities?.entries() ?? [])],
      pieces: board.pieces,
      economies: [...board.economies.entries()],
      pluginData: board.pluginData,
    }]);
  }
  return JSON.stringify({ boards } satisfies SerializedWorldState);
}

export function deserializeWorldState(json: string): WorldState {
  const raw = JSON.parse(json) as SerializedWorldState;
  const boards = new Map<string, Board>();
  for (const [key, sb] of raw.boards) {
    const board = {
      address: sb.address,
      regions: new Map(sb.regions as [RegionId, Board['regions'] extends Map<infer _K, infer V> ? V : never][]),
      // Phase 1 bridge: restore runtime entities Map from serialized data
      entities: new Map(sb.entities as [string, unknown][]),
      pieces: (sb.pieces ?? []) as Board['pieces'],
      economies: new Map(sb.economies as [PlayerId, Board['economies'] extends Map<infer _K, infer V> ? V : never][]),
      pluginData: sb.pluginData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Board;
    boards.set(key, board);
  }
  return { boards };
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
