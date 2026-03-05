import { useState } from 'react';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';

const PLAYER_ID = window.location.hash.slice(1) || 'player-1';

export function App() {
  const [gameId, setGameId] = useState<string | null>(null);

  if (gameId) {
    return <GameView gameId={gameId} playerId={PLAYER_ID} />;
  }

  return (
    <Lobby
      playerId={PLAYER_ID}
      onGameCreated={(id) => setGameId(id)}
      onJoinGame={(id) => setGameId(id)}
    />
  );
}
