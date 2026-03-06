import { useState } from 'react';
import { trpc } from '../trpc';

interface LobbyProps {
  playerId: string;
  onGameCreated: (gameId: string) => void;
  onJoinGame: (gameId: string) => void;
}

const AVAILABLE_GAMES = [
  { id: 'stub', label: '5D Stub (Test)' },
];

export function Lobby({ playerId, onGameCreated, onJoinGame }: LobbyProps) {
  const [gameIdInput, setGameIdInput] = useState('');
  const [playerList, setPlayerList] = useState(playerId);
  const [selectedGame, setSelectedGame] = useState('stub');
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);

  const createGame = trpc.createGame.useMutation({
    onSuccess: (data) => setCreatedGameId(data.gameId),
  });

  function handleCreate() {
    const players = playerList.split(',').map((p) => p.trim()).filter(Boolean);
    createGame.mutate({ gameId: selectedGame, players, settings: {} });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white gap-8">
      <h1 className="text-3xl font-bold tracking-tight">5D Multiverse</h1>
      <p className="text-gray-400 font-mono text-sm">player: {playerId}</p>

      <div className="flex flex-col gap-4 w-96">

        {/* Create */}
        <div className="bg-gray-900 rounded-lg p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Create Game</h2>

          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Game type
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
            >
              {AVAILABLE_GAMES.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Players (comma-separated IDs)
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              value={playerList}
              onChange={(e) => setPlayerList(e.target.value)}
              placeholder="alice, bob, carol"
            />
            <span className="text-xs text-gray-600">List all players upfront — others join with the game ID</span>
          </label>

          <button
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition-colors"
            onClick={handleCreate}
            disabled={createGame.isPending || !!createdGameId}
          >
            {createGame.isPending ? 'Creating…' : 'Create'}
          </button>

          {createGame.isError && (
            <p className="text-red-400 text-xs">{createGame.error.message}</p>
          )}

          {/* Created — show ID and enter button */}
          {createdGameId && (
            <div className="flex flex-col gap-2 bg-gray-800 rounded p-3">
              <p className="text-xs text-gray-400">Game created! Share this ID with other players:</p>
              <code className="text-green-400 font-mono text-sm break-all">{createdGameId}</code>
              <button
                className="bg-green-700 hover:bg-green-600 rounded px-3 py-2 text-sm font-medium"
                onClick={() => onGameCreated(createdGameId)}
              >
                Enter Game
              </button>
            </div>
          )}
        </div>

        {/* Join */}
        <div className="bg-gray-900 rounded-lg p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Join Existing Game</h2>
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            placeholder="game-1234-abcdef"
          />
          <button
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition-colors"
            onClick={() => onJoinGame(gameIdInput.trim())}
            disabled={!gameIdInput.trim()}
          >
            Join
          </button>
        </div>

      </div>
    </div>
  );
}
