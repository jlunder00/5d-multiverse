import { useState } from 'react';
import { trpc } from '../trpc';

interface LobbyProps {
  playerId: string;
  onGameCreated: (gameId: string) => void;
  onJoinGame: (gameId: string) => void;
}

export function Lobby({ playerId, onGameCreated, onJoinGame }: LobbyProps) {
  const [gameIdInput, setGameIdInput] = useState('');
  const [playerList, setPlayerList] = useState(playerId);

  const createGame = trpc.createGame.useMutation({
    onSuccess: (data) => onGameCreated(data.gameId),
  });

  function handleCreate() {
    const players = playerList.split(',').map((p) => p.trim()).filter(Boolean);
    createGame.mutate({ gameId: 'colonist', players, settings: {} });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white gap-8">
      <h1 className="text-3xl font-bold tracking-tight">5D Multiverse</h1>
      <p className="text-gray-400 font-mono text-sm">player: {playerId}</p>

      <div className="flex flex-col gap-4 w-80">
        <div className="bg-gray-900 rounded-lg p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Create Game</h2>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Players (comma-separated)
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              value={playerList}
              onChange={(e) => setPlayerList(e.target.value)}
              placeholder="alice, bob, carol"
            />
          </label>
          <button
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition-colors"
            onClick={handleCreate}
            disabled={createGame.isPending}
          >
            {createGame.isPending ? 'Creating…' : 'Create'}
          </button>
          {createGame.isError && (
            <p className="text-red-400 text-xs">{createGame.error.message}</p>
          )}
        </div>

        <div className="bg-gray-900 rounded-lg p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Join Game</h2>
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            placeholder="game-id"
          />
          <button
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition-colors"
            onClick={() => onJoinGame(gameIdInput)}
            disabled={!gameIdInput}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
