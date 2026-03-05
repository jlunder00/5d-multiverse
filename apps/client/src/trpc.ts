import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/src/trpc/router';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

export function makeTRPCClient(playerId: string) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers: { 'x-player-id': playerId },
      }),
    ],
  });
}
