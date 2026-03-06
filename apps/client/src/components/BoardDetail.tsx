interface Region {
  id: string;
  owner: string | null;
  data: Record<string, unknown>;
}

interface EntityEntry {
  id: string;
  owner: string;
  type: string;
  location: { timeline: string; turn: number; region: string };
  data: Record<string, unknown>;
}

export interface BoardDetailProps {
  timelineId: string;
  turn: number;
  regions: [string, unknown][];
  entities: [string, unknown][];
  isPending: boolean;
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
}

export function BoardDetail({
  timelineId,
  turn,
  regions,
  entities,
  isPending,
  selectedEntityId,
  onSelectEntity,
}: BoardDetailProps) {
  const regionList = regions.map(([, r]) => r as Region);
  const entityList = entities.map(([id, e]) => ({ id, ...(e as Omit<EntityEntry, 'id'>) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-white">{timelineId}:T{turn}</span>
        {isPending && (
          <span className="text-xs bg-yellow-900 text-yellow-300 rounded px-1.5 py-0.5">pending</span>
        )}
      </div>

      {/* Regions */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Regions</p>
        <div className="flex flex-wrap gap-1">
          {regionList.map((r) => (
            <div
              key={r.id}
              className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono"
            >
              {r.id}
              {r.owner && <span className="text-blue-400 ml-1">({r.owner})</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Entities */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Entities</p>
        {entityList.length === 0 ? (
          <p className="text-xs text-gray-600 italic">None</p>
        ) : (
          <div className="flex flex-col gap-1">
            {entityList.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelectEntity(selectedEntityId === e.id ? null : e.id)}
                className={`text-left text-xs rounded px-2 py-1.5 border transition-colors ${
                  selectedEntityId === e.id
                    ? 'border-blue-400 bg-blue-950 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                }`}
              >
                <span className="font-mono">{e.type}</span>
                <span className="text-gray-500 ml-2">owner: </span>
                <span className="text-blue-300">{e.owner}</span>
                <span className="text-gray-500 ml-2">@ {e.location.region}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
