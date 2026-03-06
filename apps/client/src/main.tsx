import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, makeTRPCClient } from './trpc';
import { App } from './App';
import './styles.css';

function getPlayerId(): string {
  const hash = window.location.hash.slice(1);
  if (hash) return hash;
  const id = prompt('Enter your player ID:') ?? 'player-1';
  window.location.hash = id;
  return id;
}

const playerId = getPlayerId();

function Root() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => makeTRPCClient(playerId));

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
