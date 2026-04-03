import React, { useRef } from 'react';

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
  inStabilizationPeriod: boolean;
  isActive: boolean;
  pieces: PieceInfo[];
  regions: RegionInfo[];
  /** Highlight this board as a valid time-travel destination */
  isTimeTravelTarget?: boolean;
  /** Regions on this board that are legal move destinations */
  legalMoveRegions?: string[];
  /** Region of the currently selected piece (on this board) */
  selectedPieceRegion?: string;
}

export interface BranchInfo {
  timelineId: string;
  parentTimelineId: string | null;
  divergedAtTurn: number | null;
}

export interface PiecePathStep {
  timelineId: string;
  turn: number;
  region: string;
  /** Ghost steps are inferred departure points — the piece was here but left (time travel, etc.) */
  isGhost?: boolean;
}

export interface BoardGridProps {
  cells: BoardCell[];
  maxTurn: number;
  timelines: string[];
  branchInfo?: BranchInfo[];
  selectedCell?: { timelineId: string; turn: number } | null;
  onCellClick?: (cell: BoardCell) => void;
  onPieceClick?: (pieceId: string, cell: BoardCell) => void;
  onRegionClick?: (regionId: string, cell: BoardCell) => void;
  /** Path steps for a hovered piece (chronological positions across boards) */
  piecePath?: PiecePathStep[];
  /** ID of the currently hovered piece */
  hoveredPieceId?: string | null;
  /** Called when a piece is hovered/unhovered */
  onPieceHover?: (pieceId: string | null) => void;
}

// ── Grid geometry ────────────────────────────────────────────────────────────
// Board cells are 7rem (112px) square.
// Between each pair of columns is a GUTTER — a narrow column where arrows travel.
// Layout per turn: [board_col][gutter_col][board_col][gutter_col]...
// The gutter gives arrows room to diverge without overlapping boards.
const CELL_W = 112;
const CELL_H = 112;
const GUTTER_W = 48;   // width of arrow gutter between board columns
const GAP_Y = 12;      // vertical gap between timeline rows (gap-y-3)
const PAD = 8;          // padding around grid (p-2)
const HEADER_H = 24;    // height of turn-label row (1.5rem)
const LABEL_W = 64;     // width of timeline-label column (4rem)
const COL_STRIDE = CELL_W + GUTTER_W; // 160px per turn (board + gutter)
const ROW_STRIDE = CELL_H + GAP_Y;    // 124px per timeline

/** Pixel centre of a board cell at (rowIndex, turnIndex), both 0-based. */
function cellCenter(row: number, col: number) {
  return {
    x: PAD + LABEL_W + col * COL_STRIDE + CELL_W / 2,
    y: PAD + HEADER_H + GAP_Y + row * ROW_STRIDE + CELL_H / 2,
  };
}

/** Right edge of a board cell (where an outgoing arrow starts). */
function cellRight(row: number, col: number) {
  const c = cellCenter(row, col);
  return { x: c.x + CELL_W / 2, y: c.y };
}

/** Left edge of a board cell (where an incoming arrow ends). */
function cellLeft(row: number, col: number) {
  const c = cellCenter(row, col);
  return { x: c.x - CELL_W / 2, y: c.y };
}

/** Centre of the gutter strip to the RIGHT of column `col`. */
function gutterCenter(col: number) {
  return PAD + LABEL_W + col * COL_STRIDE + CELL_W + GUTTER_W / 2;
}

// ── Cell-internal geometry (must match BoardCellView CSS) ─────────────────────
// Header bar: px-1.5 py-0.5 + text + border ≈ 20px.  Padding: p-1 = 4px.  Gap: gap-0.5 = 2px.
const CELL_HEADER_H = 20;
const CELL_PAD = 4;
const CELL_GAP = 2;

/** Pixel centre of a region within a board cell, in absolute SVG coordinates. */
function regionPixelCenter(
  boardRow: number,
  boardCol: number,
  regionIndex: number,
  totalRegions: number,
): { x: number; y: number } {
  const cols = Math.min(totalRegions, 3);
  const rows = Math.ceil(totalRegions / cols);
  const availW = CELL_W - 2 * CELL_PAD;
  const availH = CELL_H - CELL_HEADER_H - 2 * CELL_PAD;
  const rw = (availW - (cols - 1) * CELL_GAP) / cols;
  const rh = (availH - (rows - 1) * CELL_GAP) / rows;
  const rCol = regionIndex % cols;
  const rRow = Math.floor(regionIndex / cols);

  // Cell top-left in SVG coords
  const cellX = PAD + LABEL_W + boardCol * COL_STRIDE;
  const cellY = PAD + HEADER_H + GAP_Y + boardRow * ROW_STRIDE;

  return {
    x: cellX + CELL_PAD + rCol * (rw + CELL_GAP) + rw / 2,
    y: cellY + CELL_HEADER_H + CELL_PAD + rRow * (rh + CELL_GAP) + rh / 2,
  };
}

// Stable player→color mapping by hashing the player ID
const PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4'];
function playerColor(playerId: string): string {
  let h = 0;
  for (const c of playerId) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return PALETTE[h % PALETTE.length]!;
}

// ── Connector path computation ───────────────────────────────────────────────

interface Connector {
  /** SVG <path> d attribute */
  d: string;
  /** Whether this connector represents a branch divergence (vs. same-timeline continuation) */
  isBranch: boolean;
}

/**
 * Build the SVG connector paths for the entire grid.
 *
 * There are two kinds of connectors:
 *   1. **Continuation arrows**: horizontal [board]──→[board] within the same timeline.
 *      These travel through the gutter between two consecutive board columns.
 *   2. **Branch arrows**: at a branch point, the continuation arrow from the parent
 *      board splits — one fork continues right to the next parent board, the other
 *      diverges diagonally down (or up) through the gutter into the child timeline's
 *      origin board.
 *
 * All paths route through the gutter strip so they never overlap board cells.
 *
 * @param timelines   Ordered list of timeline IDs (row 0 = first timeline)
 * @param maxTurn     Number of turn columns
 * @param cellExists  Check whether a board exists at (timelineId, turn)
 * @param branchInfo  Branch parent/child relationships
 * @returns Array of Connector objects (each has an SVG `d` string and a type flag)
 */
function buildConnectors(
  timelines: string[],
  maxTurn: number,
  cellExists: (timelineId: string, turn: number) => boolean,
  branchInfo: BranchInfo[],
): { connectors: Connector[]; forkDots: { x: number; y: number }[] } {
  const rowOf = new Map(timelines.map((tl, i) => [tl, i]));

  // Build lookup: for each (parentTimeline, divergedAtTurn), which child timelines branch off?
  const branchesAt = new Map<string, BranchInfo[]>();
  for (const b of branchInfo) {
    if (b.parentTimelineId == null || b.divergedAtTurn == null) continue;
    const key = `${b.parentTimelineId}:${b.divergedAtTurn}`;
    if (!branchesAt.has(key)) branchesAt.set(key, []);
    branchesAt.get(key)!.push(b);
  }

  const connectors: Connector[] = [];
  const forkDots: { x: number; y: number }[] = [];

  for (const tl of timelines) {
    const row = rowOf.get(tl)!;

    for (let turn = 1; turn < maxTurn; turn++) {
      const col = turn - 1;       // 0-based column of current turn
      const nextCol = col + 1;    // 0-based column of turn+1
      const hasNext = cellExists(tl, turn + 1);
      const hasCurrent = cellExists(tl, turn);
      if (!hasCurrent) continue;

      // Which child timelines branch off at turn+1 FROM this timeline?
      // (divergedAtTurn = turn+1 means the new TL's first board is at col nextCol,
      //  and the causal arrow comes from the board at col = turn-1)
      const children = branchesAt.get(`${tl}:${turn + 1}`) ?? [];
      const hasFork = children.length > 0;

      // Gutter centre x between col and nextCol
      const gx = gutterCenter(col);
      const srcRight = cellRight(row, col);

      if (!hasNext && !hasFork) continue; // dead end, no arrow needed

      if (!hasFork) {
        // Simple continuation — straight horizontal line through gutter
        const dstLeft = cellLeft(row, nextCol);
        connectors.push({
          d: `M ${srcRight.x} ${srcRight.y} L ${dstLeft.x} ${dstLeft.y}`,
          isBranch: false,
        });
      } else {
        // Railroad fork: line from board edge to fork dot, then branches out.
        const forkY = srcRight.y;
        forkDots.push({ x: gx, y: forkY });

        // Stem: board right edge → fork dot
        connectors.push({
          d: `M ${srcRight.x} ${srcRight.y} L ${gx} ${forkY}`,
          isBranch: false,
        });

        // Continuation arrow: fork dot → next board on same timeline (if exists)
        if (hasNext) {
          const dstLeft = cellLeft(row, nextCol);
          connectors.push({
            d: `M ${gx} ${forkY} L ${dstLeft.x} ${dstLeft.y}`,
            isBranch: false,
          });
        }

        // Branch arrows: fork dot → each child timeline's first board
        for (const child of children) {
          const childRow = rowOf.get(child.timelineId);
          if (childRow === undefined) continue;
          const dstLeft = cellLeft(childRow, nextCol);

          // Quadratic bezier: starts horizontal from fork dot, curves to arrive
          // horizontally at the child board's left edge.
          // Control point: (gx, dstLeft.y) — keeps departure horizontal, arrival horizontal.
          connectors.push({
            d: `M ${gx} ${forkY} Q ${gx} ${dstLeft.y} ${dstLeft.x} ${dstLeft.y}`,
            isBranch: true,
          });
        }
      }
    }
  }

  return { connectors, forkDots };
}

/**
 * Resolve a piece-path step to its pixel position (region centre within the board cell).
 * Returns null if the cell or region can't be found.
 */
function resolveStepPosition(
  step: PiecePathStep,
  timelines: string[],
  cellMap: Map<string, BoardCell>,
): { x: number; y: number } | null {
  const row = timelines.indexOf(step.timelineId);
  if (row === -1) return null;
  const cell = cellMap.get(`${step.timelineId}:${step.turn}`);
  if (!cell) return null;
  const regionIndex = cell.regions.findIndex(r => r.id === step.region);
  if (regionIndex === -1) return null;
  return regionPixelCenter(row, step.turn - 1, regionIndex, cell.regions.length);
}

/**
 * Build SVG path segments tracing a piece's journey from region to region.
 * Each consecutive pair of steps becomes an arrow — straight for same-board
 * advances (or spatial moves), curved for cross-timeline time-travel jumps.
 */
function buildPiecePathConnectors(
  steps: PiecePathStep[],
  timelines: string[],
  cellMap: Map<string, BoardCell>,
): string[] {
  if (steps.length < 2) return [];
  const paths: string[] = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const from = steps[i]!;
    const to = steps[i + 1]!;
    const src = resolveStepPosition(from, timelines, cellMap);
    const dst = resolveStepPosition(to, timelines, cellMap);
    if (!src || !dst) continue;

    const sameTimeline = from.timelineId === to.timelineId;
    const sameTurn = from.turn === to.turn;

    if (sameTimeline && sameTurn) {
      // Spatial move within the same board — straight line
      paths.push(`M ${src.x} ${src.y} L ${dst.x} ${dst.y}`);
    } else if (sameTimeline) {
      // Same timeline, different turn — route through the gutter (above/below cells)
      // Exit right from source region, curve to destination region
      const midX = (src.x + dst.x) / 2;
      paths.push(`M ${src.x} ${src.y} C ${midX} ${src.y} ${midX} ${dst.y} ${dst.x} ${dst.y}`);
    } else {
      // Cross-timeline jump (time travel) — S-curve through gutter space
      const midX = (src.x + dst.x) / 2;
      paths.push(
        `M ${src.x} ${src.y} C ${midX} ${src.y} ${midX} ${dst.y} ${dst.x} ${dst.y}`
      );
    }
  }
  return paths;
}

export function BoardGrid({
  cells,
  maxTurn,
  timelines,
  branchInfo = [],
  selectedCell,
  onCellClick,
  onPieceClick,
  onRegionClick,
  piecePath = [],
  hoveredPieceId,
  onPieceHover,
}: BoardGridProps) {
  const cellMap = new Map(cells.map((c) => [`${c.timelineId}:${c.turn}`, c]));
  const scrollRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number; captured: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, captured: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!panStart.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    if (!panStart.current.captured) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      el.setPointerCapture(e.pointerId);
      panStart.current.captured = true;
    }
    el.scrollLeft = panStart.current.scrollLeft - dx;
    el.scrollTop = panStart.current.scrollTop - dy;
  }

  function onPointerUp() {
    panStart.current = null;
  }

  // Build connector paths
  const { connectors, forkDots } = buildConnectors(
    timelines,
    maxTurn,
    (tl, turn) => cellMap.get(`${tl}:${turn}`)?.exists ?? false,
    branchInfo,
  );

  // SVG dimensions
  const svgW = PAD + LABEL_W + maxTurn * COL_STRIDE + PAD;
  const svgH = PAD + HEADER_H + GAP_Y + timelines.length * ROW_STRIDE + PAD;

  // Grid template: alternating board columns and gutter columns
  // [label] [board1] [gutter1] [board2] [gutter2] ... [boardN]
  // Last column has no trailing gutter.
  const colTemplate = `${LABEL_W}px ` + Array.from({ length: maxTurn }, (_, i) =>
    i < maxTurn - 1 ? `${CELL_W}px ${GUTTER_W}px` : `${CELL_W}px`
  ).join(' ');

  return (
    <div
      ref={scrollRef}
      className="overflow-auto cursor-grab select-none h-full"
      style={{ cursor: panStart.current ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative" style={{ minWidth: svgW, minHeight: svgH }}>

      {/* SVG connector overlay */}
      <svg
        width={svgW}
        height={svgH}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 5 }}
      >
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#6b7280" />
          </marker>
          <marker id="arrow-branch" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#a78bfa" />
          </marker>
          <marker id="arrow-path" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#facc15" />
          </marker>
        </defs>
        {connectors.map((c, i) => (
          <path
            key={i}
            d={c.d}
            stroke={c.isBranch ? '#a78bfa' : '#6b7280'}
            strokeWidth={1.5}
            strokeDasharray={c.isBranch ? '6 3' : undefined}
            fill="none"
            markerEnd={c.isBranch ? 'url(#arrow-branch)' : 'url(#arrow)'}
          />
        ))}
        {/* Fork dots — railroad junction points */}
        {forkDots.map((dot, i) => (
          <circle key={`dot-${i}`} cx={dot.x} cy={dot.y} r={4} fill="#9ca3af" />
        ))}
        {/* Piece path overlay — shown on hover */}
        {piecePath.length >= 2 && buildPiecePathConnectors(piecePath, timelines, cellMap).map((d, i) => (
          <path
            key={`pp-${i}`}
            d={d}
            stroke="#facc15"
            strokeWidth={2.5}
            strokeDasharray="4 2"
            fill="none"
            opacity={0.8}
            markerEnd="url(#arrow-path)"
          />
        ))}
        {/* Piece path dots — highlight each region the piece has been in */}
        {piecePath.map((step, i) => {
          const pos = resolveStepPosition(step, timelines, cellMap);
          if (!pos) return null;
          return step.isGhost ? (
            // Ghost dot: hollow ring showing inferred departure point
            <circle
              key={`ppd-${i}`}
              cx={pos.x} cy={pos.y} r={4}
              fill="none" stroke="#facc15" strokeWidth={1.5}
              opacity={0.5} strokeDasharray="2 1"
            />
          ) : (
            // Solid dot: piece was confirmed here in a snapshot
            <circle
              key={`ppd-${i}`}
              cx={pos.x} cy={pos.y} r={4}
              fill="#facc15" opacity={0.7}
              stroke="#000" strokeWidth={0.5}
            />
          );
        })}
      </svg>

      <div
        className="grid p-2"
        style={{
          gridTemplateColumns: colTemplate,
          gridTemplateRows: `${HEADER_H}px repeat(${timelines.length}, ${CELL_H}px)`,
          rowGap: `${GAP_Y}px`,
          columnGap: '0px',
        }}
      >
        {/* Corner cell */}
        <div className="sticky top-0 left-0 z-20 flex items-center justify-center text-xs text-gray-500 font-mono bg-gray-950">
          TL\T
        </div>

        {/* Turn labels — each spans board col + gutter col (except last) */}
        {Array.from({ length: maxTurn }, (_, i) => (
          <React.Fragment key={i}>
            <div
              className="sticky top-0 z-10 flex items-center justify-center text-xs text-gray-500 font-mono bg-gray-950 cursor-pointer hover:text-gray-300"
              style={i < maxTurn - 1 ? { gridColumn: 'span 2' } : undefined}
              onClick={() => scrollRef.current?.scrollTo({ left: i * COL_STRIDE, behavior: 'smooth' })}
            >
              T{i + 1}
            </div>
          </React.Fragment>
        ))}

        {timelines.map((timelineId, rowIndex) => (
          <React.Fragment key={timelineId}>
            {/* Timeline label */}
            <div
              className="sticky left-0 z-10 flex items-center justify-end pr-2 text-xs text-gray-500 font-mono bg-gray-950 cursor-pointer hover:text-gray-300"
              onClick={() => scrollRef.current?.scrollTo({ top: rowIndex * ROW_STRIDE, behavior: 'smooth' })}
            >
              {timelineId}
            </div>

            {/* Board cells interleaved with gutter spacers */}
            {Array.from({ length: maxTurn }, (_, i) => {
              const turn = i + 1;
              const key = `${timelineId}:${turn}`;
              const cell = cellMap.get(key);
              const isSelected = selectedCell?.timelineId === timelineId && selectedCell?.turn === turn;

              return (
                <React.Fragment key={turn}>
                  {/* Board cell */}
                  {(!cell?.exists) ? (
                    <div className="rounded border border-dashed border-gray-800 bg-gray-950 opacity-40" />
                  ) : (
                    <BoardCellView
                      cell={cell}
                      isSelected={isSelected}
                      onCellClick={() => onCellClick?.(cell)}
                      onPieceClick={(id) => onPieceClick?.(id, cell)}
                      onRegionClick={(rid) => onRegionClick?.(rid, cell)}
                      hoveredPieceId={hoveredPieceId}
                      onPieceHover={onPieceHover}
                    />
                  )}
                  {/* Gutter spacer (empty div — arrows are drawn in SVG) */}
                  {i < maxTurn - 1 && <div />}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </div>
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
  hoveredPieceId?: string | null | undefined;
  onPieceHover?: ((pieceId: string | null) => void) | undefined;
}

function BoardCellView({ cell, isSelected, onCellClick, onPieceClick, onRegionClick, hoveredPieceId, onPieceHover }: BoardCellViewProps) {
  let borderColor = 'border-gray-700';
  let bg = 'bg-gray-900';
  if (cell.isTimeTravelTarget) { borderColor = 'border-purple-500'; bg = 'bg-purple-950'; }
  else if (cell.inStabilizationPeriod) { borderColor = 'border-yellow-500'; bg = 'bg-yellow-950'; }
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
      <div className="flex items-center justify-between px-1.5 py-0.5 border-b border-gray-800 shrink-0">
        <span className="font-mono text-gray-500 text-[10px]">
          {cell.timelineId}:T{cell.turn}
        </span>
        <span className="flex gap-0.5">
          {cell.inStabilizationPeriod && <span className="text-yellow-400 text-[10px]" title="In stabilization period">◈</span>}
          {cell.isTimeTravelTarget && <span className="text-purple-400 text-[10px]">⟲</span>}
        </span>
      </div>

      <div className="flex-1 grid gap-0.5 p-1" style={{ gridTemplateColumns: `repeat(${Math.min(cell.regions.length, 3)}, 1fr)` }}>
        {cell.regions.map((region) => {
          const pieces = piecesByRegion.get(region.id) ?? [];
          const isLegal = cell.legalMoveRegions?.includes(region.id);
          const isSource = cell.selectedPieceRegion === region.id;

          let regionBg = 'bg-gray-800 hover:bg-gray-700';
          if (isSource) regionBg = 'bg-blue-800';
          else if (isLegal) regionBg = 'bg-green-900 hover:bg-green-800 ring-1 ring-green-500';
          else if (cell.isTimeTravelTarget) regionBg = 'bg-purple-900 hover:bg-purple-800';

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
                    onMouseEnter={() => onPieceHover?.(piece.id)}
                    onMouseLeave={() => onPieceHover?.(null)}
                    className={`w-3 h-3 rounded-full border hover:scale-125 transition-transform shrink-0 ${
                      hoveredPieceId === piece.id ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-black/30'
                    }`}
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
