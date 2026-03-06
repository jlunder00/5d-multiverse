import { useState } from 'react';
import { trpc } from '../trpc';
import { BoardGrid, BoardCell, PieceInfo, RegionInfo } from './BoardGrid';
import { PlayerSwitcher } from './PlayerSwitcher';

interface SelectedPiece {
  id: string;
  owner: string;
  fromBoard: { timelineId: string; turn: number };
  fromRegion: string;
}

interface GameViewProps {
  gameId: string;
  playerId: string;
  onPlayerSwitch: (id: string) => void;
  onLeave: () => void;
}

// Adjacent regions for the stub cross-map. Game-agnostic code won't need this —
// legal destinations will come from the server eventually.
const STUB_ADJACENT: Record<string, string[]> = {
  C: ['N', 'S', 'E', 'W'],
  N: ['C'], S: ['C'], E: ['C'], W: ['C'],
};

function buildActionId() {
  return `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseEntities(raw: [string, unknown][]): PieceInfo[] {
  return raw.map(([id, e]) => {
    const ent = e as { owner: string; type: string; location: { region: string } };
    return { id, owner: ent.owner, type: ent.type, region: ent.location.region };
  });
}

function parseRegions(raw: [string, unknown][]): RegionInfo[] {
  return raw.map(([, r]) => {
    const reg = r as { id: string; owner: string | null };
    return { id: reg.id, owner: reg.owner };
  });
}

export function GameView({ gameId, playerId, onPlayerSwitch, onLeave }: GameViewProps) {
  const [selectedPiece, setSelectedPiece] = useState<SelectedPiece | null>(null);
  const [timeBranchMode, setTimeBranchMode] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<{ timelineId: string; turn: number } | null>(null);

  const state = trpc.getVisibleState.useQuery(
    { gameId, fogSetting: 'current_turn_fog' },
    { refetchInterval: 2000 },
  );

  const endTurnMut = trpc.endTurn.useMutation({ onSuccess: () => { state.refetch(); clearSelection(); } });
  const submitAction = trpc.submitAction.useMutation({
    onSuccess: () => { state.refetch(); clearSelection(); },
  });

  function clearSelection() {
    setSelectedPiece(null);
    setTimeBranchMode(false);
  }

  if (state.isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-400">Loading…</div>
  );
  if (state.isError) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 text-red-400">
      Error: {state.error.message}
    </div>
  );

  const data = state.data!;
  const isMyTurn = data.currentPlayer === playerId;

  // Unique players from economies on any board
  const allPlayers = [...new Set(
    data.boards.flatMap((b) => b.economies.map(([p]) => p as string))
  )];

  // Active board = current turn's board on TL0 (the main timeline)
  const activeTurn = data.globalTurn;
  const activeTimeline = 'TL0';

  const timelines = [...new Set(data.boards.map((b) => b.address.timeline as string))].sort();
  const maxTurn = Math.max(activeTurn, ...data.boards.map((b) => b.address.turn as number));

  const pendingKeys = new Set(
    data.pendingBranches.map(([, pb]) => {
      const p = pb as { originAddress: { timeline: string; turn: number } };
      return `${p.originAddress.timeline}:${p.originAddress.turn}`;
    }),
  );

  // Build cells with highlight info
  const cells: BoardCell[] = data.boards.map((b) => {
    const tl = b.address.timeline as string;
    const t = b.address.turn as number;
    const pieces = parseEntities(b.entities);
    const regions = parseRegions(b.regions);

    // Time branch target: any past board when in time branch mode
    const isTimeBranchTarget = timeBranchMode && t < activeTurn;

    // Legal move regions: adjacent to selected piece's region, on this same board
    let legalMoveRegions: string[] | undefined;
    let selectedPieceRegion: string | undefined;
    if (
      selectedPiece &&
      !timeBranchMode &&
      tl === selectedPiece.fromBoard.timelineId &&
      t === selectedPiece.fromBoard.turn
    ) {
      selectedPieceRegion = selectedPiece.fromRegion;
      legalMoveRegions = STUB_ADJACENT[selectedPiece.fromRegion] ?? [];
    }

    return {
      timelineId: tl,
      turn: t,
      exists: true,
      isPending: pendingKeys.has(`${tl}:${t}`),
      isActive: tl === activeTimeline && t === activeTurn,
      pieces,
      regions,
      ...(isTimeBranchTarget ? { isTimeBranchTarget: true } : {}),
      ...(legalMoveRegions ? { legalMoveRegions } : {}),
      ...(selectedPieceRegion ? { selectedPieceRegion } : {}),
    };
  });

  function handlePieceClick(pieceId: string, cell: BoardCell) {
    if (!isMyTurn) return;
    const piece = cell.pieces.find((p) => p.id === pieceId);
    if (!piece) return;
    if (piece.owner !== playerId) return; // can't select opponent's piece

    // Toggle selection
    if (selectedPiece?.id === pieceId) { clearSelection(); return; }

    setSelectedPiece({
      id: pieceId,
      owner: piece.owner,
      fromBoard: { timelineId: cell.timelineId, turn: cell.turn },
      fromRegion: piece.region,
    });
    setTimeBranchMode(false);
  }

  function handleRegionClick(regionId: string, cell: BoardCell) {
    if (!isMyTurn || !selectedPiece || timeBranchMode) return;

    const legalRegions = STUB_ADJACENT[selectedPiece.fromRegion] ?? [];
    if (!legalRegions.includes(regionId)) return;

    // Same board move
    const { fromBoard, fromRegion } = selectedPiece;
    submitAction.mutate({
      gameId,
      boardAddress: { timeline: fromBoard.timelineId, turn: fromBoard.turn },
      action: {
        id: buildActionId() as any,
        type: 'move' as any,
        player: playerId as any,
        from: { timeline: fromBoard.timelineId as any, turn: fromBoard.turn as any, region: fromRegion as any },
        to: { timeline: fromBoard.timelineId as any, turn: fromBoard.turn as any, region: regionId as any },
        entityId: selectedPiece.id as any,
        payload: {},
        submittedAt: Date.now(),
      },
    });
  }

  function handleCellClick(cell: BoardCell) {
    if (timeBranchMode && cell.turn < activeTurn) {
      // Submit time branch to this past board
      const srcBoard = { timelineId: activeTimeline, turn: activeTurn };
      submitAction.mutate({
        gameId,
        boardAddress: { timeline: srcBoard.timelineId, turn: srcBoard.turn },
        action: {
          id: buildActionId() as any,
          type: 'time_branch' as any,
          player: playerId as any,
          from: { timeline: srcBoard.timelineId as any, turn: srcBoard.turn as any, region: 'C' as any },
          to: { timeline: cell.timelineId as any, turn: cell.turn as any, region: 'C' as any },
          payload: {},
          submittedAt: Date.now(),
        },
      });
      return;
    }
    setSelectedBoard({ timelineId: cell.timelineId, turn: cell.turn });
    clearSelection();
  }

  function handlePass() {
    const board = { timelineId: activeTimeline, turn: activeTurn };
    submitAction.mutate({
      gameId,
      boardAddress: { timeline: board.timelineId, turn: board.turn },
      action: {
        id: buildActionId() as any,
        type: 'pass' as any,
        player: playerId as any,
        from: { timeline: board.timelineId as any, turn: board.turn as any, region: 'C' as any },
        to: { timeline: board.timelineId as any, turn: board.turn as any, region: 'C' as any },
        payload: {},
        submittedAt: Date.now(),
      },
    });
  }

  const statusMsg = (() => {
    if (timeBranchMode) return { text: 'Click any past board to branch into it', color: 'text-purple-300' };
    if (selectedPiece) return { text: `${selectedPiece.id} selected — click a highlighted region to move, or click Time Branch`, color: 'text-blue-300' };
    if (isMyTurn) return { text: 'Your turn — click one of your pieces to select it', color: 'text-green-400' };
    return { text: `Waiting for ${data.currentPlayer}…`, color: 'text-gray-500' };
  })();

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onLeave} className="text-gray-500 hover:text-white text-sm">← Lobby</button>
          <span className="font-bold tracking-tight">5D Multiverse</span>
          <span className="text-gray-600 font-mono text-xs truncate max-w-32">{gameId}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <PlayerSwitcher players={allPlayers} currentPlayerId={playerId} onSwitch={onPlayerSwitch} />
          <span className="text-sm text-gray-400">
            Turn <span className="text-white font-mono">{data.globalTurn}</span>
          </span>
          <span className="text-sm text-gray-400">
            Active: <span className="text-yellow-400 font-mono">{data.currentPlayer}</span>
          </span>
          <span className="text-sm text-gray-600 font-mono">you: {playerId}</span>
          {data.winner && <span className="text-green-400 font-semibold">🏆 {data.winner} wins!</span>}
        </div>
      </header>

      {/* Status bar */}
      <div className={`px-4 py-1.5 text-sm border-b border-gray-800 flex items-center justify-between ${statusMsg.color}`}>
        <span>{statusMsg.text}</span>
        {(selectedPiece || timeBranchMode) && (
          <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-white">Cancel (Esc)</button>
        )}
      </div>

      {/* Main board grid */}
      <main className="flex-1 overflow-auto p-3">
        <BoardGrid
          cells={cells}
          maxTurn={maxTurn}
          timelines={timelines}
          selectedCell={selectedBoard}
          onCellClick={handleCellClick}
          onPieceClick={handlePieceClick}
          onRegionClick={handleRegionClick}
        />
      </main>

      {/* Footer actions */}
      <footer className="border-t border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
        <div className="text-xs text-red-400">
          {submitAction.isError && submitAction.error.message}
        </div>
        {isMyTurn && !data.winner && (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePass}
              disabled={submitAction.isPending}
              className="text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded px-3 py-1.5"
            >
              Pass
            </button>
            <button
              onClick={() => { setTimeBranchMode((v) => !v); setSelectedPiece(null); }}
              className={`text-sm rounded px-3 py-1.5 transition-colors ${
                timeBranchMode
                  ? 'bg-purple-600 hover:bg-purple-500 ring-1 ring-purple-400'
                  : 'bg-purple-900 hover:bg-purple-800'
              }`}
            >
              {timeBranchMode ? 'Cancel Time Branch' : 'Time Branch →'}
            </button>
            <button
              onClick={() => endTurnMut.mutate({ gameId })}
              disabled={endTurnMut.isPending}
              className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded px-4 py-1.5 font-medium"
            >
              {endTurnMut.isPending ? 'Ending…' : 'End Turn'}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
