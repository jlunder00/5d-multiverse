import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/src/trpc/router';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

// Module-level mutable player ID — updated by the dev player switcher.
// The header function reads this dynamically so switching players takes effect
// on the next request without recreating the tRPC client.
let _currentPlayerId = '';
export function getCurrentPlayerId(): string { return _currentPlayerId; }
export function setCurrentPlayerId(id: string): void { _currentPlayerId = id; }

export function makeTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers: () => ({ 'x-player-id': _currentPlayerId }),
      }),
    ],
  });
}
