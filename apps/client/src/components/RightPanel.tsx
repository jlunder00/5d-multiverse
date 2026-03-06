import { useState } from 'react';

interface BoardEntry {
  address: { timeline: unknown; turn: unknown };
  regions: [string, unknown][];
  entities: [string, unknown][];
  economies: [string, unknown][];
  pluginData: Record<string, unknown>;
}

interface RightPanelProps {
  selectedBoard: { timelineId: string; turn: number } | null;
  boards: BoardEntry[];
  pendingBranches: [string, unknown][];
  onBoardSelect: (addr: { timelineId: string; turn: number }) => void;
}

type Tab = 'info' | 'navigator';

export function RightPanel({ selectedBoard, boards, pendingBranches, onBoardSelect }: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('info');

  const board = selectedBoard
    ? boards.find(
        (b) =>
          (b.address.timeline as string) === selectedBoard.timelineId &&
          (b.address.turn as number) === selectedBoard.turn,
      )
    : null;

  const pendingTimelineIds = new Set(
    pendingBranches.map(([, pb]) => {
      const p = pb as { originAddress?: { timeline?: string } };
      return p.originAddress?.timeline ?? '';
    }),
  );

  const maxTurn = Math.max(0, ...boards.map((b) => b.address.turn as number));

  // Group boards by timeline for the navigator
  const byTimeline = new Map<string, BoardEntry[]>();
  for (const b of boards) {
    const tl = b.address.timeline as string;
    if (!byTimeline.has(tl)) byTimeline.set(tl, []);
    byTimeline.get(tl)!.push(b);
  }
  for (const arr of byTimeline.values()) {
    arr.sort((a, b) => (a.address.turn as number) - (b.address.turn as number));
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-800 text-xs text-gray-300">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 shrink-0">
        {(['info', 'navigator'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 capitalize transition-colors ${
              tab === t
                ? 'text-white border-b-2 border-blue-400 bg-gray-800'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'info' && <InfoTab board={board} selectedBoard={selectedBoard} pendingTimelineIds={pendingTimelineIds} />}
        {tab === 'navigator' && (
          <NavigatorTab
            byTimeline={byTimeline}
            maxTurn={maxTurn}
            selectedBoard={selectedBoard}
            onBoardSelect={(addr) => { onBoardSelect(addr); setTab('info'); }}
          />
        )}
      </div>
    </div>
  );
}

function InfoTab({
  board,
  selectedBoard,
  pendingTimelineIds,
}: {
  board: BoardEntry | null | undefined;
  selectedBoard: { timelineId: string; turn: number } | null;
  pendingTimelineIds: Set<string>;
}) {
  if (!selectedBoard || !board) {
    return (
      <div className="p-3 text-gray-600 italic">No board selected</div>
    );
  }

  const tl = board.address.timeline as string;
  const turn = board.address.turn as number;
  const isGhost = !!(board.pluginData?.isPendingBranch);
  const isPending = pendingTimelineIds.has(tl);

  return (
    <div className="p-2 space-y-3">
      {/* Board identity */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-white">{tl}:T{turn}</span>
        {isGhost && <span className="text-yellow-400 text-[10px] bg-yellow-950 px-1 rounded">◈ Ghost</span>}
        {isPending && !isGhost && <span className="text-yellow-600 text-[10px] bg-yellow-950 px-1 rounded">◈ Pending</span>}
      </div>

      {/* Regions */}
      <section>
        <div className="text-gray-500 uppercase tracking-wide text-[10px] mb-1">Regions</div>
        <table className="w-full">
          <tbody>
            {board.regions.map(([id, r]) => {
              const reg = r as { owner: string | null };
              return (
                <tr key={id} className="border-b border-gray-800">
                  <td className="py-0.5 font-mono text-gray-400">{id}</td>
                  <td className="py-0.5 text-right text-gray-500">{reg.owner ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Entities */}
      <section>
        <div className="text-gray-500 uppercase tracking-wide text-[10px] mb-1">Entities</div>
        {board.entities.length === 0 ? (
          <div className="text-gray-600 italic">none</div>
        ) : (
          board.entities.map(([id, e]) => {
            const ent = e as { owner: string; type: string; location: { region: string } };
            return (
              <div key={id} className="flex justify-between py-0.5 border-b border-gray-800">
                <span className="font-mono text-gray-400 truncate">{id}</span>
                <span className="text-gray-500 ml-2 shrink-0">{ent.owner} @ {ent.location.region}</span>
              </div>
            );
          })
        )}
      </section>

      {/* Economies */}
      <section>
        <div className="text-gray-500 uppercase tracking-wide text-[10px] mb-1">Economies</div>
        {board.economies.map(([playerId, eco]) => {
          const e = eco as { resources: Record<string, number> };
          const res = Object.entries(e.resources);
          return (
            <div key={playerId} className="py-0.5 border-b border-gray-800">
              <span className="text-gray-400 font-mono">{playerId}</span>
              {res.length > 0 && (
                <span className="text-gray-600 ml-2">{res.map(([k, v]) => `${k}:${v}`).join(' ')}</span>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function NavigatorTab({
  byTimeline,
  maxTurn,
  selectedBoard,
  onBoardSelect,
}: {
  byTimeline: Map<string, BoardEntry[]>;
  maxTurn: number;
  selectedBoard: { timelineId: string; turn: number } | null;
  onBoardSelect: (addr: { timelineId: string; turn: number }) => void;
}) {
  return (
    <div className="p-2 space-y-3">
      {[...byTimeline.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tl, boards]) => (
        <div key={tl}>
          <div className="text-gray-500 font-mono text-[10px] uppercase mb-1">{tl}</div>
          <div className="space-y-0.5">
            {boards.map((b) => {
              const turn = b.address.turn as number;
              const isSelected = selectedBoard?.timelineId === tl && selectedBoard?.turn === turn;
              const isGhost = !!(b.pluginData?.isPendingBranch);
              const isActive = turn === maxTurn && !isGhost;

              let badge = <span className="text-gray-600 text-[9px]">past</span>;
              if (isGhost) badge = <span className="text-yellow-400 text-[9px]">ghost</span>;
              else if (isActive) badge = <span className="text-blue-400 text-[9px]">active</span>;

              return (
                <button
                  key={turn}
                  onClick={() => onBoardSelect({ timelineId: tl, turn })}
                  className={`w-full flex items-center justify-between px-2 py-0.5 rounded transition-colors ${
                    isSelected ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'
                  }`}
                >
                  <span className="font-mono">T{turn}</span>
                  {badge}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
