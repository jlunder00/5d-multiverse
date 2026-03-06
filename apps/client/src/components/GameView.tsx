import { useState } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { trpc } from '../trpc';
import { BoardGrid, BoardCell, PieceInfo, RegionInfo } from './BoardGrid';
import { PlayerSwitcher } from './PlayerSwitcher';
import { RightPanel } from './RightPanel';

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
  const [selectedBoard, setSelectedBoard] = useState<{ timelineId: string; turn: number } | null>(null);

  const state = trpc.getVisibleState.useQuery(
    { gameId, fogSetting: 'full_information' },
    { refetchInterval: 2000 },
  );

  const endTurnMut = trpc.endTurn.useMutation({ onSuccess: () => { state.refetch(); clearSelection(); } });
  const submitAction = trpc.submitAction.useMutation({
    onSuccess: () => { state.refetch(); clearSelection(); },
  });

  function clearSelection() {
    setSelectedPiece(null);
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

  const allPlayers = [...new Set(
    data.boards.flatMap((b) => b.economies.map(([p]) => p as string))
  )];

  const activeTurn = data.globalTurn;
  // Prefer TL0; fall back to first non-ghost timeline at the current turn
  const activeTimeline = (() => {
    const atCurrentTurn = data.boards
      .filter(b => (b.address.turn as number) === activeTurn && !b.pluginData?.isPendingBranch)
      .map(b => b.address.timeline as string);
    return atCurrentTurn.includes('TL0') ? 'TL0' : (atCurrentTurn[0] ?? 'TL0');
  })();

  const timelines = [...new Set(data.boards.map((b) => b.address.timeline as string))].sort();
  const maxTurn = Math.max(activeTurn, ...data.boards.map((b) => b.address.turn as number));

  // Read piece's current region fresh from server data to avoid stale closure
  const freshRegion = (() => {
    if (!selectedPiece) return null;
    const board = data.boards.find(b =>
      (b.address.timeline as string) === selectedPiece.fromBoard.timelineId &&
      (b.address.turn as number) === selectedPiece.fromBoard.turn
    );
    const entry = board?.entities.find(([id]) => id === selectedPiece.id);
    const loc = (entry?.[1] as { location?: { region?: string } } | undefined)?.location;
    return loc?.region ?? selectedPiece.fromRegion;
  })();

  const pendingKeys = new Set(
    data.pendingBranches.map(([, pb]) => {
      const p = pb as { originAddress: { timeline: string; turn: number } };
      return `${p.originAddress.timeline}:${p.originAddress.turn}`;
    }),
  );

  const cells: BoardCell[] = data.boards.map((b) => {
    const tl = b.address.timeline as string;
    const t = b.address.turn as number;
    const pieces = parseEntities(b.entities);
    const regions = parseRegions(b.regions);

    const isGhost = !!(b.pluginData?.isPendingBranch);
    const ghostOriginAddress = isGhost
      ? (b.pluginData.originAddress as { timeline: string; turn: number })
      : undefined;

    // Past boards are highlighted as time-travel targets when a piece is selected
    const isTimeTravelTarget = !!selectedPiece && t < activeTurn;

    // Legal spatial move regions: only on the same active board as the selected piece
    let legalMoveRegions: string[] | undefined;
    let selectedPieceRegion: string | undefined;
    if (selectedPiece && tl === selectedPiece.fromBoard.timelineId && t === selectedPiece.fromBoard.turn) {
      const from = freshRegion ?? selectedPiece.fromRegion;
      selectedPieceRegion = from;
      legalMoveRegions = STUB_ADJACENT[from] ?? [];
    }

    return {
      timelineId: tl,
      turn: t,
      exists: true,
      isPending: pendingKeys.has(`${tl}:${t}`),
      isActive: t === activeTurn && !isGhost,
      isGhost,
      ...(ghostOriginAddress ? { ghostOriginAddress } : {}),
      pieces,
      regions,
      ...(isTimeTravelTarget ? { isTimeTravelTarget: true } : {}),
      ...(legalMoveRegions ? { legalMoveRegions } : {}),
      ...(selectedPieceRegion ? { selectedPieceRegion } : {}),
    };
  });

  function handlePieceClick(pieceId: string, cell: BoardCell) {
    if (!isMyTurn) return;
    if (cell.isGhost) return; // ghost boards are pending — not actionable
    const piece = cell.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.owner !== playerId) return;
    if (selectedPiece?.id === pieceId) { clearSelection(); return; }

    // Normalize to the active board so actions always submit from the present.
    // The user may click a piece on a past board just to identify it.
    const activeBoard = data.boards.find(b =>
      !b.pluginData?.isPendingBranch &&
      (b.address.turn as number) === activeTurn &&
      b.entities.some(([id]) => id === pieceId)
    );
    if (!activeBoard) return; // piece doesn't exist at the current turn
    const activeEntry = activeBoard.entities.find(([id]) => id === pieceId);
    const activeLoc = (activeEntry?.[1] as { location?: { region?: string } } | undefined)?.location;
    if (!activeLoc?.region) return;

    setSelectedPiece({
      id: pieceId,
      owner: piece.owner,
      fromBoard: { timelineId: activeBoard.address.timeline as string, turn: activeTurn },
      fromRegion: activeLoc.region,
    });
  }

  function handleRegionClick(regionId: string, cell: BoardCell) {
    if (!isMyTurn || !selectedPiece) return;
    const fromRegion = freshRegion ?? selectedPiece.fromRegion;

    if (cell.timelineId === selectedPiece.fromBoard.timelineId && cell.turn === activeTurn) {
      // Spatial move on the same board
      const legal = STUB_ADJACENT[fromRegion] ?? [];
      if (!legal.includes(regionId)) return;
      submitAction.mutate({
        gameId,
        boardAddress: { timeline: selectedPiece.fromBoard.timelineId, turn: activeTurn },
        action: {
          id: buildActionId() as any,
          type: 'move' as any,
          player: playerId as any,
          entityId: selectedPiece.id as any,
          from: { timeline: selectedPiece.fromBoard.timelineId as any, turn: activeTurn as any, region: fromRegion as any },
          to: { timeline: selectedPiece.fromBoard.timelineId as any, turn: activeTurn as any, region: regionId as any },
          payload: {},
          submittedAt: Date.now(),
        },
      });
    } else if (cell.turn < activeTurn) {
      // Time travel — piece sent to a past board (ghost or historical)
      const toTimeline = cell.ghostOriginAddress?.timeline ?? cell.timelineId;
      const toTurn = cell.ghostOriginAddress?.turn ?? cell.turn;
      submitAction.mutate({
        gameId,
        boardAddress: { timeline: selectedPiece.fromBoard.timelineId, turn: activeTurn },
        action: {
          id: buildActionId() as any,
          type: 'move_to_past' as any,
          player: playerId as any,
          entityId: selectedPiece.id as any,
          from: { timeline: selectedPiece.fromBoard.timelineId as any, turn: activeTurn as any, region: fromRegion as any },
          to: { timeline: toTimeline as any, turn: toTurn as any, region: regionId as any },
          payload: {},
          submittedAt: Date.now(),
        },
      });
    }
  }

  function handleCellClick(cell: BoardCell) {
    setSelectedBoard({ timelineId: cell.timelineId, turn: cell.turn });
  }

  function handlePass() {
    const activeBoard = data.boards.find(b =>
      (b.address.turn as number) === activeTurn && !b.pluginData?.isPendingBranch
    );
    if (!activeBoard) return;
    const tl = activeBoard.address.timeline as string;
    submitAction.mutate({
      gameId,
      boardAddress: { timeline: tl, turn: activeTurn },
      action: {
        id: buildActionId() as any,
        type: 'pass' as any,
        player: playerId as any,
        from: { timeline: tl as any, turn: activeTurn as any, region: 'C' as any },
        to: { timeline: tl as any, turn: activeTurn as any, region: 'C' as any },
        payload: {},
        submittedAt: Date.now(),
      },
    });
  }

  const statusMsg = (() => {
    if (selectedPiece) return {
      text: `${selectedPiece.id} selected — click a highlighted region to move, or click a past board to send it back in time`,
      color: 'text-blue-300',
    };
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
        {selectedPiece && (
          <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-white">Cancel (Esc)</button>
        )}
      </div>

      {/* Main content: board grid + right panel */}
      <PanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize={75} minSize={40}>
          <main className="h-full overflow-hidden p-3">
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
        </Panel>
        <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-500 transition-colors cursor-col-resize" />
        <Panel defaultSize={25} minSize={15} collapsible>
          <RightPanel
            selectedBoard={selectedBoard}
            boards={data.boards}
            pendingBranches={data.pendingBranches}
            onBoardSelect={(addr) => setSelectedBoard(addr)}
          />
        </Panel>
      </PanelGroup>

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
