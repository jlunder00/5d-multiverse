import { initTRPC, TRPCError } from '@trpc/server';
import { type Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Middleware that checks the caller has provided a valid playerId header. */
export const playerProcedure = t.procedure.use(async ({ ctx, next }) => {
  const playerId = ctx.req.headers['x-player-id'];
  if (!playerId || typeof playerId !== 'string') {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing x-player-id header' });
  }
  return next({ ctx: { ...ctx, playerId } });
});
