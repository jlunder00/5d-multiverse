import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, makeTRPCClient, setCurrentPlayerId } from './trpc';
import { App } from './App';
import './styles.css';

function getInitialPlayerId(): string {
  const hash = window.location.hash.slice(1);
  if (hash) return hash;
  const id = prompt('Enter your player ID:') ?? 'player-1';
  window.location.hash = id;
  return id;
}

const initialPlayerId = getInitialPlayerId();
setCurrentPlayerId(initialPlayerId);

function Root() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => makeTRPCClient());
  const [playerId, setPlayerId] = useState(initialPlayerId);

  function handlePlayerSwitch(newId: string) {
    setCurrentPlayerId(newId);
    setPlayerId(newId);
    window.location.hash = newId;
    queryClient.invalidateQueries();
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App playerId={playerId} onPlayerSwitch={handlePlayerSwitch} />
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
