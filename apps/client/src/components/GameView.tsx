import { useState } from 'react';
import { trpc } from '../trpc';
import { BoardGrid, BoardCell } from './BoardGrid';

interface GameViewProps {
  gameId: string;
  playerId: string;
}

export function GameView({ gameId, playerId }: GameViewProps) {
  const [selectedCell, setSelectedCell] = useState<{ timelineId: string; turn: number } | null>(null);

  const state = trpc.getVisibleState.useQuery(
    { gameId, fogSetting: 'current_turn_fog' },
    { refetchInterval: 2000 },
  );

  const endTurn = trpc.endTurn.useMutation({
    onSuccess: () => state.refetch(),
  });

  if (state.isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-400">Loading…</div>;
  }

  if (state.isError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-red-400">
        Error: {state.error.message}
      </div>
    );
  }

  const data = state.data!;
  const isMyTurn = data.currentPlayer === playerId;

  // Derive grid dimensions from boards
  const timelines = [...new Set(data.boards.map((b) => b.address.timeline as string))].sort();
  const maxTurn = data.globalTurn;

  const cells: BoardCell[] = data.boards.map((b) => ({
    timelineId: b.address.timeline as string,
    turn: b.address.turn as number,
    exists: true,
    isPending: data.pendingBranches.some(([, pb]) => {
      const p = pb as { originAddress: { timeline: string; turn: number } };
      return p.originAddress.timeline === b.address.timeline &&
             p.originAddress.turn === b.address.turn;
    }),
    isActive: isMyTurn &&
      b.address.timeline === timelines[0] &&
      b.address.turn === data.globalTurn,
    pluginData: b.pluginData,
  }));

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg">5D Multiverse</span>
          <span className="text-gray-500 font-mono text-sm">{gameId}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Turn <span className="text-white font-mono">{data.globalTurn}</span>
          </span>
          <span className="text-sm text-gray-400">
            Active: <span className="text-yellow-400 font-mono">{data.currentPlayer}</span>
          </span>
          <span className="text-sm text-gray-400 font-mono">you: {playerId}</span>
          {data.winner && (
            <span className="text-green-400 font-semibold">🏆 {data.winner} wins!</span>
          )}
        </div>
      </header>

      {/* Board grid */}
      <main className="flex-1 overflow-auto p-4">
        <BoardGrid
          cells={cells}
          maxTurn={maxTurn}
          timelines={timelines}
          onCellClick={(cell) => setSelectedCell({ timelineId: cell.timelineId, turn: cell.turn })}
          selectedCell={selectedCell}
        />
      </main>

      {/* Footer: selected cell info + actions */}
      <footer className="border-t border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
        <div className="text-sm text-gray-400">
          {selectedCell
            ? <span>Selected: <span className="font-mono text-white">{selectedCell.timelineId}:{selectedCell.turn}</span></span>
            : <span className="italic">Click a board to select it</span>}
        </div>
        <div className="flex items-center gap-3">
          {isMyTurn && !data.winner && (
            <button
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition-colors"
              onClick={() => endTurn.mutate({ gameId })}
              disabled={endTurn.isPending}
            >
              {endTurn.isPending ? 'Ending turn…' : 'End Turn'}
            </button>
          )}
          {!isMyTurn && !data.winner && (
            <span className="text-gray-500 text-sm italic">Waiting for {data.currentPlayer}…</span>
          )}
        </div>
      </footer>
    </div>
  );
}
