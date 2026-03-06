import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, playerProcedure } from './init.js';
import { games, actions } from '../db/schema.js';
import {
  serializeWorldState,
  deserializeWorldState,
  serializeBranchTree,
  deserializeBranchTree,
  serializeWindows,
  deserializeWindows,
} from './serialization.js';
import {
  getPlugin,
  createExecutionOrder,
  processAction,
  advanceTurn,
  advanceAllTimelines,
  checkWinCondition,
  filterWorldForPlayer,
  createMovementTools,
  createDiceTools,
  createAdjudicationTools,
  setBoard,
  GameLoopState,
} from '@5d/engine';
import {
  PlayerId,
  BranchId,
  BranchWindow,
  ActionSchema,
  boardKey,
} from '@5d/types';

function makeGameId(): string {
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeEngineTools(plugin: ReturnType<typeof getPlugin>) {
  const movement = createMovementTools((regionId: import('@5d/types').RegionId) =>
    plugin.mapLoader.getAdjacentRegions(regionId),
  );
  const dice = createDiceTools();
  const adjudication = createAdjudicationTools();
  return { movement, dice, adjudication };
}

function loadGameState(row: typeof games.$inferSelect): GameLoopState {
  const world = deserializeWorldState(row.worldState);
  const branchTree = deserializeBranchTree(row.branchTree);
  const order = JSON.parse(row.executionOrder) as GameLoopState['order'];
  const windows = deserializeWindows(row.windows) as Map<BranchId, BranchWindow>;
  return {
    world,
    branchTree,
    order,
    windows,
    winner: (row.winner as PlayerId | null) ?? null,
  };
}

function persistGameState(
  id: string,
  gameId: string,
  status: string,
  players: PlayerId[],
  settings: Record<string, unknown>,
  state: GameLoopState,
) {
  return {
    id,
    gameId,
    status,
    players: JSON.stringify(players),
    settings: JSON.stringify(settings),
    worldState: serializeWorldState(state.world),
    branchTree: serializeBranchTree(state.branchTree),
    executionOrder: JSON.stringify(state.order),
    windows: serializeWindows(state.windows),
    winner: state.winner ?? null,
    updatedAt: Date.now(),
  };
}

export const appRouter = router({
  /** Create a new game lobby. */
  createGame: publicProcedure
    .input(z.object({
      gameId: z.string(),
      players: z.array(z.string()),
      settings: z.record(z.string(), z.unknown()).default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const plugin = getPlugin(input.gameId);
      if (input.players.length < plugin.minPlayers || input.players.length > plugin.maxPlayers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${plugin.name} requires ${plugin.minPlayers}–${plugin.maxPlayers} players`,
        });
      }

      const id = makeGameId();
      const players = input.players as PlayerId[];
      const initialBoard = plugin.createInitialBoard(players, input.settings);
      const boards = new Map([[boardKey(initialBoard.address), initialBoard]]);
      const world = { boards, pendingBranches: new Map() };
      const order = createExecutionOrder(players, 1 as ReturnType<typeof createExecutionOrder>['globalTurn']);
      const state: GameLoopState = {
        world,
        branchTree: {
          rootTimelineId: initialBoard.address.timeline,
          nodes: {
            [initialBoard.address.timeline]: {
              timelineId: initialBoard.address.timeline,
              parentTimelineId: null,
              divergedAtTurn: null,
              divergedByActionId: null,
              children: [],
            },
          },
          pendingBranches: {},
        },
        order,
        windows: new Map(),
        winner: null,
      };

      await ctx.db.insert(games).values({
        ...persistGameState(id, input.gameId, 'active', players, input.settings, state),
        createdAt: Date.now(),
      });

      return { gameId: id };
    }),

  /** Get the full game state (unfiltered — for debugging/spectators). */
  getGame: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(games).where(eq(games.id, input.gameId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        id: row.id,
        gameId: row.gameId,
        status: row.status,
        players: JSON.parse(row.players) as string[],
        winner: row.winner,
      };
    }),

  /** Get the world state filtered for the requesting player's fog setting. */
  getVisibleState: playerProcedure
    .input(z.object({
      gameId: z.string(),
      fogSetting: z.enum(['full_information', 'current_turn_fog', 'timeline_fog'])
        .default('current_turn_fog'),
    }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(games).where(eq(games.id, input.gameId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });

      const state = loadGameState(row);
      const playerId = ctx.playerId as PlayerId;
      const activePlayer = state.order.priorityQueue[state.order.currentIndex] as PlayerId;

      const filtered = filterWorldForPlayer(
        state.world,
        playerId,
        'full_information',
        activePlayer,
      );

      return {
        boards: [...filtered.boards.entries()].map(([key, board]) => ({
          key,
          address: board.address,
          regions: [...board.regions.entries()],
          entities: [...board.entities.entries()],
          economies: [...board.economies.entries()],
          pluginData: board.pluginData,
        })),
        pendingBranches: [...filtered.pendingBranches.entries()],
        currentPlayer: activePlayer,
        globalTurn: state.order.globalTurn,
        winner: state.winner,
      };
    }),

  /** Submit an action for the current player's turn. */
  submitAction: playerProcedure
    .input(z.object({
      gameId: z.string(),
      action: ActionSchema,
      boardAddress: z.object({
        timeline: z.string(),
        turn: z.number(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(games).where(eq(games.id, input.gameId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.status !== 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game is not active' });
      }

      const plugin = getPlugin(row.gameId);
      const tools = makeEngineTools(plugin);
      let state = loadGameState(row);
      const playerId = ctx.playerId as PlayerId;

      // Verify it's this player's turn
      const currentPlayer = state.order.priorityQueue[state.order.currentIndex];
      if (currentPlayer !== playerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your turn' });
      }

      const address = input.boardAddress as { timeline: ReturnType<typeof Object.keys>[number]; turn: number } as Parameters<typeof processAction>[4];

      let result: ReturnType<typeof processAction>['world'] | undefined;
      try {
        state = processAction(
          state,
          plugin,
          tools,
          input.action,
          address,
          false,
          undefined,
        );
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Action failed',
        });
      }

      // Check win condition
      const winner = checkWinCondition(state, plugin);
      if (winner) state = { ...state, winner };

      const status = winner ? 'finished' : row.status;
      const players = JSON.parse(row.players) as PlayerId[];
      const settings = JSON.parse(row.settings) as Record<string, unknown>;

      await ctx.db
        .update(games)
        .set(persistGameState(row.id, row.gameId, status, players, settings, state))
        .where(eq(games.id, input.gameId));

      await ctx.db.insert(actions).values({
        id: input.action.id,
        gameId: input.gameId,
        playerId,
        action: JSON.stringify(input.action),
        result: JSON.stringify({ success: true }),
        committedAt: Date.now(),
      });

      return { success: true, winner };
    }),

  /** Advance to the next player / global turn. */
  endTurn: playerProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(games).where(eq(games.id, input.gameId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });

      const plugin = getPlugin(row.gameId);
      const tools = makeEngineTools(plugin);
      let state = loadGameState(row);
      const playerId = ctx.playerId as PlayerId;

      const currentPlayer = state.order.priorityQueue[state.order.currentIndex];
      if (currentPlayer !== playerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your turn' });
      }

      const prevGlobalTurn = state.order.globalTurn;
      let nextTimelineCounter = Object.keys(state.branchTree.nodes).length;
      state = advanceTurn(
        state,
        plugin,
        tools,
        (s: GameLoopState, _window: BranchWindow) => s, // half-action callback: no-op (client drives this)
        () => `TL${nextTimelineCounter++}`,
      );

      // Every endTurn: advance every timeline's latest board by one turn.
      // This includes ghost/pending timelines so they stay in sync.
      if (state.order.globalTurn > prevGlobalTurn) {
        state = { ...state, world: advanceAllTimelines(state.world) };
      }

      const players = JSON.parse(row.players) as PlayerId[];
      const settings = JSON.parse(row.settings) as Record<string, unknown>;

      await ctx.db
        .update(games)
        .set(persistGameState(row.id, row.gameId, row.status, players, settings, state))
        .where(eq(games.id, input.gameId));

      return { globalTurn: state.order.globalTurn, currentPlayer: state.order.priorityQueue[state.order.currentIndex] };
    }),
});

export type AppRouter = typeof appRouter;
