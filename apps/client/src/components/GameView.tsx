import { useState } from 'react';
import { trpc } from '../trpc';
import { BoardGrid, BoardCell } from './BoardGrid';
import { BoardDetail } from './BoardDetail';
import { PlayerSwitcher } from './PlayerSwitcher';

type ActionMode = 'idle' | 'selecting_move_dest' | 'selecting_time_branch_dest';

interface SelectedBoard {
  timelineId: string;
  turn: number;
}

interface GameViewProps {
  gameId: string;
  playerId: string;
  onPlayerSwitch: (id: string) => void;
  onLeave: () => void;
}

export function GameView({ gameId, playerId, onPlayerSwitch, onLeave }: GameViewProps) {
  const [selectedBoard, setSelectedBoard] = useState<SelectedBoard | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('idle');

  const state = trpc.getVisibleState.useQuery(
    { gameId, fogSetting: 'current_turn_fog' },
    { refetchInterval: 2000 },
  );

  const endTurn = trpc.endTurn.useMutation({ onSuccess: () => state.refetch() });
  const submitAction = trpc.submitAction.useMutation({ onSuccess: () => { state.refetch(); setActionMode('idle'); } });

  if (state.isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-400">Loading…</div>;
  }
  if (state.isError) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-950 text-red-400">Error: {state.error.message}</div>;
  }

  const data = state.data!;
  const isMyTurn = data.currentPlayer === playerId;
  const players = data.boards.flatMap((b) => b.economies.map(([p]) => p as string));
  const uniquePlayers = [...new Set(players)];

  // Derive grid dimensions
  const timelines = [...new Set(data.boards.map((b) => b.address.timeline as string))].sort();
  const maxTurn = Math.max(data.globalTurn, ...data.boards.map((b) => b.address.turn as number));

  // Build pending set
  const pendingKeys = new Set(
    data.pendingBranches.map(([, pb]) => {
      const p = pb as { originAddress: { timeline: string; turn: number } };
      return `${p.originAddress.timeline}:${p.originAddress.turn}`;
    }),
  );

  const cells: BoardCell[] = data.boards.map((b) => ({
    timelineId: b.address.timeline as string,
    turn: b.address.turn as number,
    exists: true,
    isPending: pendingKeys.has(`${b.address.timeline}:${b.address.turn}`),
    isActive: isMyTurn && selectedBoard?.timelineId === b.address.timeline && selectedBoard?.turn === b.address.turn,
    pluginData: b.pluginData,
  }));

  // The currently selected board's full data
  const selectedBoardData = selectedBoard
    ? data.boards.find(
        (b) => b.address.timeline === selectedBoard.timelineId && b.address.turn === selectedBoard.turn,
      )
    : null;

  function buildActionId() {
    return `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function handleCellClick(cell: BoardCell) {
    if (actionMode === 'selecting_time_branch_dest' && selectedBoard) {
      // Submit a time_branch action targeting this past board
      if (cell.turn >= (selectedBoard?.turn ?? 0)) {
        alert('Time branch destination must be a past turn.');
        return;
      }
      submitAction.mutate({
        gameId,
        boardAddress: { timeline: selectedBoard.timelineId, turn: selectedBoard.turn },
        action: {
          id: buildActionId() as any,
          type: 'time_branch' as any,
          player: playerId as any,
          from: { timeline: selectedBoard.timelineId as any, turn: selectedBoard.turn as any, region: 'C' as any },
          to: { timeline: cell.timelineId as any, turn: cell.turn as any, region: 'C' as any },
          payload: {},
          submittedAt: Date.now(),
        },
      });
      setActionMode('idle');
      return;
    }

    setSelectedBoard({ timelineId: cell.timelineId, turn: cell.turn });
    setSelectedEntityId(null);
    setActionMode('idle');
  }

  function handleMove(destRegion: string) {
    if (!selectedBoard || !selectedEntityId || !selectedBoardData) return;

    const entity = selectedBoardData.entities.find(([id]) => id === selectedEntityId);
    if (!entity) return;
    const loc = (entity[1] as any).location;

    submitAction.mutate({
      gameId,
      boardAddress: { timeline: selectedBoard.timelineId, turn: selectedBoard.turn },
      action: {
        id: buildActionId() as any,
        type: 'move' as any,
        player: playerId as any,
        from: { timeline: loc.timeline, turn: loc.turn, region: loc.region },
        to: { timeline: loc.timeline, turn: loc.turn, region: destRegion as any },
        entityId: selectedEntityId as any,
        payload: {},
        submittedAt: Date.now(),
      },
    });
    setActionMode('idle');
    setSelectedEntityId(null);
  }

  function handlePass() {
    if (!selectedBoard) return;
    submitAction.mutate({
      gameId,
      boardAddress: { timeline: selectedBoard.timelineId, turn: selectedBoard.turn },
      action: {
        id: buildActionId() as any,
        type: 'pass' as any,
        player: playerId as any,
        from: { timeline: selectedBoard.timelineId as any, turn: selectedBoard.turn as any, region: 'C' as any },
        to: { timeline: selectedBoard.timelineId as any, turn: selectedBoard.turn as any, region: 'C' as any },
        payload: {},
        submittedAt: Date.now(),
      },
    });
  }

  const modeLabel: Record<ActionMode, string> = {
    idle: '',
    selecting_move_dest: 'Click a region to move to',
    selecting_time_branch_dest: 'Click a past board to branch from',
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={onLeave} className="text-gray-500 hover:text-white text-sm">← Lobby</button>
          <span className="font-bold">5D Multiverse</span>
          <span className="text-gray-500 font-mono text-xs">{gameId}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <PlayerSwitcher players={uniquePlayers} currentPlayerId={playerId} onSwitch={onPlayerSwitch} />
          <span className="text-sm text-gray-400">Turn <span className="text-white font-mono">{data.globalTurn}</span></span>
          <span className="text-sm text-gray-400">Active: <span className="text-yellow-400 font-mono">{data.currentPlayer}</span></span>
          <span className="text-sm text-gray-500 font-mono">you: {playerId}</span>
          {data.winner && <span className="text-green-400 font-semibold">🏆 {data.winner} wins!</span>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Board grid */}
        <main className="flex-1 overflow-auto p-4">
          {actionMode !== 'idle' && (
            <div className="mb-3 px-3 py-2 bg-blue-950 border border-blue-700 rounded text-sm text-blue-300 flex items-center justify-between">
              <span>{modeLabel[actionMode]}</span>
              <button onClick={() => setActionMode('idle')} className="text-blue-500 hover:text-blue-300 text-xs ml-4">Cancel</button>
            </div>
          )}
          <BoardGrid
            cells={cells}
            maxTurn={maxTurn}
            timelines={timelines}
            onCellClick={handleCellClick}
            selectedCell={selectedBoard}
          />
        </main>

        {/* Side panel */}
        <aside className="w-72 border-l border-gray-800 flex flex-col overflow-hidden">
          {selectedBoardData ? (
            <>
              <div className="flex-1 overflow-auto p-4">
                <BoardDetail
                  timelineId={selectedBoard!.timelineId}
                  turn={selectedBoard!.turn}
                  regions={selectedBoardData.regions}
                  entities={selectedBoardData.entities}
                  isPending={pendingKeys.has(`${selectedBoard!.timelineId}:${selectedBoard!.turn}`)}
                  selectedEntityId={selectedEntityId}
                  onSelectEntity={setSelectedEntityId}
                />

                {/* Move destination picker */}
                {actionMode === 'selecting_move_dest' && selectedEntityId && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Move to region</p>
                    {['C', 'N', 'S', 'E', 'W'].map((r) => (
                      <button
                        key={r}
                        onClick={() => handleMove(r)}
                        className="mr-1 mb-1 text-xs bg-gray-700 hover:bg-blue-700 rounded px-2 py-1 font-mono"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {isMyTurn && !data.winner && (
                <div className="border-t border-gray-800 p-4 flex flex-col gap-2">
                  <button
                    onClick={handlePass}
                    disabled={submitAction.isPending}
                    className="text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded px-3 py-2"
                  >
                    Pass
                  </button>
                  {selectedEntityId && (
                    <button
                      onClick={() => setActionMode('selecting_move_dest')}
                      className="text-sm bg-blue-700 hover:bg-blue-600 rounded px-3 py-2"
                    >
                      Move piece
                    </button>
                  )}
                  <button
                    onClick={() => setActionMode('selecting_time_branch_dest')}
                    className="text-sm bg-purple-800 hover:bg-purple-700 rounded px-3 py-2"
                  >
                    Time Branch →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm italic p-4 text-center">
              Click a board to inspect it
            </div>
          )}
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="text-xs text-gray-600">
          {submitAction.isError && <span className="text-red-400">{submitAction.error.message}</span>}
        </div>
        <div className="flex items-center gap-3">
          {isMyTurn && !data.winner && (
            <button
              onClick={() => endTurn.mutate({ gameId })}
              disabled={endTurn.isPending}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium"
            >
              {endTurn.isPending ? 'Ending…' : 'End Turn'}
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
