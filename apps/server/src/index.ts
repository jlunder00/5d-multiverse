import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { db } from './db/index.js';
import { createContext } from './trpc/context.js';
import { appRouter, type AppRouter } from './trpc/router.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });

await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: createContext(db),
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});

server.get('/health', async () => ({ ok: true }));

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

try {
  await server.listen({ port: PORT, host: HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
