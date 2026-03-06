import React from 'react';

export interface PieceInfo {
  id: string;
  owner: string;
  type: string;
  region: string;
}

export interface RegionInfo {
  id: string;
  owner: string | null;
}

export interface BoardCell {
  timelineId: string;
  turn: number;
  exists: boolean;
  isPending: boolean;
  isActive: boolean;
  pieces: PieceInfo[];
  regions: RegionInfo[];
  /** Highlight this board as a valid time-branch destination */
  isTimeBranchTarget?: boolean;
  /** Regions on this board that are legal move destinations */
  legalMoveRegions?: string[];
  /** Region of the currently selected piece (on this board) */
  selectedPieceRegion?: string;
}

export interface BoardGridProps {
  cells: BoardCell[];
  maxTurn: number;
  timelines: string[];
  selectedCell?: { timelineId: string; turn: number } | null;
  onCellClick?: (cell: BoardCell) => void;
  onPieceClick?: (pieceId: string, cell: BoardCell) => void;
  onRegionClick?: (regionId: string, cell: BoardCell) => void;
}

// Stable player→color mapping by hashing the player ID
const PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4'];
function playerColor(playerId: string): string {
  let h = 0;
  for (const c of playerId) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return PALETTE[h % PALETTE.length]!;
}

export function BoardGrid({
  cells,
  maxTurn,
  timelines,
  selectedCell,
  onCellClick,
  onPieceClick,
  onRegionClick,
}: BoardGridProps) {
  const cellMap = new Map(cells.map((c) => [`${c.timelineId}:${c.turn}`, c]));

  return (
    <div className="overflow-auto">
      <div
        className="grid gap-1 p-2"
        style={{
          gridTemplateColumns: `4rem repeat(${maxTurn}, minmax(7rem, 1fr))`,
          gridTemplateRows: `1.5rem repeat(${timelines.length}, 7rem)`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-center text-xs text-gray-500 font-mono">TL\T</div>
        {Array.from({ length: maxTurn }, (_, i) => (
          <div key={i} className="flex items-center justify-center text-xs text-gray-500 font-mono">
            T{i + 1}
          </div>
        ))}

        {timelines.map((timelineId) => (
          <React.Fragment key={timelineId}>
            <div className="flex items-center justify-end pr-2 text-xs text-gray-500 font-mono">
              {timelineId}
            </div>
            {Array.from({ length: maxTurn }, (_, i) => {
              const turn = i + 1;
              const key = `${timelineId}:${turn}`;
              const cell = cellMap.get(key);
              const isSelected = selectedCell?.timelineId === timelineId && selectedCell?.turn === turn;

              if (!cell?.exists) {
                return <div key={turn} className="rounded border border-dashed border-gray-800 bg-gray-950 opacity-40" />;
              }
              return (
                <BoardCellView
                  key={turn}
                  cell={cell}
                  isSelected={isSelected}
                  onCellClick={() => onCellClick?.(cell)}
                  onPieceClick={(id) => onPieceClick?.(id, cell)}
                  onRegionClick={(rid) => onRegionClick?.(rid, cell)}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

interface BoardCellViewProps {
  cell: BoardCell;
  isSelected: boolean;
  onCellClick: () => void;
  onPieceClick: (id: string) => void;
  onRegionClick: (regionId: string) => void;
}

function BoardCellView({ cell, isSelected, onCellClick, onPieceClick, onRegionClick }: BoardCellViewProps) {
  // Border / bg
  let borderColor = 'border-gray-700';
  let bg = 'bg-gray-900';
  if (cell.isTimeBranchTarget) { borderColor = 'border-purple-500'; bg = 'bg-purple-950'; }
  else if (cell.isPending) { borderColor = 'border-yellow-600'; bg = 'bg-yellow-950'; }
  else if (cell.isActive) { borderColor = 'border-blue-500'; bg = 'bg-blue-950'; }
  if (isSelected) borderColor = 'border-white';

  const piecesByRegion = new Map<string, PieceInfo[]>();
  for (const p of cell.pieces) {
    if (!piecesByRegion.has(p.region)) piecesByRegion.set(p.region, []);
    piecesByRegion.get(p.region)!.push(p);
  }

  return (
    <div
      className={`rounded border ${borderColor} ${bg} flex flex-col overflow-hidden cursor-pointer transition-colors text-xs`}
      onClick={onCellClick}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-1.5 py-0.5 border-b border-gray-800 shrink-0">
        <span className="font-mono text-gray-500 text-[10px]">
          {cell.timelineId}:T{cell.turn}
        </span>
        {cell.isPending && <span className="text-yellow-400 text-[10px]">◈</span>}
        {cell.isTimeBranchTarget && <span className="text-purple-400 text-[10px]">⟲</span>}
      </div>

      {/* Region grid */}
      <div className="flex-1 grid gap-0.5 p-1" style={{ gridTemplateColumns: `repeat(${Math.min(cell.regions.length, 3)}, 1fr)` }}>
        {cell.regions.map((region) => {
          const pieces = piecesByRegion.get(region.id) ?? [];
          const isLegal = cell.legalMoveRegions?.includes(region.id);
          const isSource = cell.selectedPieceRegion === region.id;

          let regionBg = 'bg-gray-800 hover:bg-gray-700';
          if (isSource) regionBg = 'bg-blue-800';
          else if (isLegal) regionBg = 'bg-green-900 hover:bg-green-800 ring-1 ring-green-500';

          return (
            <div
              key={region.id}
              className={`rounded flex flex-col items-center justify-center ${regionBg} transition-colors cursor-pointer min-h-0`}
              onClick={(e) => { e.stopPropagation(); onRegionClick(region.id); }}
            >
              <span className="text-gray-400 font-mono text-[9px] leading-none">{region.id}</span>
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                {pieces.map((piece) => (
                  <button
                    key={piece.id}
                    title={`${piece.type} (${piece.owner})`}
                    onClick={(e) => { e.stopPropagation(); onPieceClick(piece.id); }}
                    className="w-3 h-3 rounded-full border border-black/30 hover:scale-125 transition-transform shrink-0"
                    style={{ backgroundColor: playerColor(piece.owner) }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
