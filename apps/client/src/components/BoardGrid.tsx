import React from 'react';

export interface BoardCell {
  timelineId: string;
  turn: number;
  /** true = this board exists and has been played */
  exists: boolean;
  /** true = pending branch (ghost board) */
  isPending: boolean;
  /** true = current active board for the player */
  isActive: boolean;
  label?: string;
  pluginData?: Record<string, unknown>;
}

export interface BoardGridProps {
  /** All boards to render, keyed by "timeline:turn" */
  cells: BoardCell[];
  /** Max turn number to display */
  maxTurn: number;
  /** Ordered list of timeline IDs (top to bottom) */
  timelines: string[];
  onCellClick?: (cell: BoardCell) => void;
  selectedCell?: { timelineId: string; turn: number } | null;
}

/**
 * The main 5D board grid.
 * Timelines run top-to-bottom (rows), turns run left-to-right (columns).
 */
export function BoardGrid({ cells, maxTurn, timelines, onCellClick, selectedCell }: BoardGridProps) {
  const cellMap = new Map(cells.map((c) => [`${c.timelineId}:${c.turn}`, c]));

  return (
    <div className="overflow-auto">
      <div
        className="grid gap-1 p-2"
        style={{
          gridTemplateColumns: `5rem repeat(${maxTurn}, minmax(5rem, 1fr))`,
          gridTemplateRows: `2rem repeat(${timelines.length}, 5rem)`,
        }}
      >
        {/* Header row: turn numbers */}
        <div className="flex items-center justify-center text-xs text-gray-400 font-mono">TL\T</div>
        {Array.from({ length: maxTurn }, (_, i) => (
          <div key={i} className="flex items-center justify-center text-xs text-gray-400 font-mono">
            T{i + 1}
          </div>
        ))}

        {/* Timeline rows */}
        {timelines.map((timelineId) => (
          <React.Fragment key={timelineId}>
            {/* Row label */}
            <div className="flex items-center justify-end pr-2 text-xs text-gray-400 font-mono">
              {timelineId}
            </div>

            {/* Board cells */}
            {Array.from({ length: maxTurn }, (_, i) => {
              const turn = i + 1;
              const key = `${timelineId}:${turn}`;
              const cell = cellMap.get(key);
              const isSelected =
                selectedCell?.timelineId === timelineId && selectedCell?.turn === turn;

              if (!cell || !cell.exists) {
                return (
                  <div
                    key={turn}
                    className="rounded border border-dashed border-gray-700 bg-gray-900 opacity-30"
                  />
                );
              }

              return (
                <BoardCellView
                  key={turn}
                  cell={cell}
                  isSelected={isSelected}
                  onClick={() => onCellClick?.(cell)}
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
  onClick: () => void;
}

function BoardCellView({ cell, isSelected, onClick }: BoardCellViewProps) {
  const base = 'rounded border cursor-pointer transition-all duration-100 p-1 flex flex-col gap-0.5 overflow-hidden';

  let style: string;
  if (cell.isPending) {
    style = 'border-yellow-500 bg-yellow-950 opacity-80 hover:opacity-100';
  } else if (cell.isActive) {
    style = 'border-blue-400 bg-blue-950 hover:bg-blue-900';
  } else {
    style = 'border-gray-600 bg-gray-800 hover:bg-gray-700';
  }

  const selectedStyle = isSelected ? 'ring-2 ring-white' : '';

  return (
    <div className={`${base} ${style} ${selectedStyle}`} onClick={onClick}>
      <div className="text-xs font-mono text-gray-400 leading-none">
        {cell.isPending && <span className="text-yellow-400">◈ </span>}
        {cell.label ?? `${cell.timelineId}:${cell.turn}`}
      </div>
      {/* Plugin-specific content rendered as key/value pairs for now */}
      {cell.pluginData && (
        <div className="text-xs text-gray-500 leading-none truncate">
          {Object.entries(cell.pluginData)
            .slice(0, 2)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
