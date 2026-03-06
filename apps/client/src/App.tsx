import { useState } from 'react';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';

interface AppProps {
  playerId: string;
  onPlayerSwitch: (id: string) => void;
}

export function App({ playerId, onPlayerSwitch }: AppProps) {
  const [gameId, setGameId] = useState<string | null>(null);

  if (gameId) {
    return (
      <GameView
        gameId={gameId}
        playerId={playerId}
        onPlayerSwitch={onPlayerSwitch}
        onLeave={() => setGameId(null)}
      />
    );
  }

  return (
    <Lobby
      playerId={playerId}
      onGameCreated={(id) => setGameId(id)}
      onJoinGame={(id) => setGameId(id)}
    />
  );
}
