interface PlayerSwitcherProps {
  players: string[];
  currentPlayerId: string;
  onSwitch: (id: string) => void;
}

// Only rendered in dev mode — import.meta.env.DEV is false in production builds.
export function PlayerSwitcher({ players, currentPlayerId, onSwitch }: PlayerSwitcherProps) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="flex items-center gap-1 bg-yellow-950 border border-yellow-800 rounded px-2 py-1">
      <span className="text-yellow-500 text-xs font-mono mr-1">DEV</span>
      {players.map((p) => (
        <button
          key={p}
          onClick={() => onSwitch(p)}
          className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
            p === currentPlayerId
              ? 'bg-yellow-600 text-white'
              : 'text-yellow-400 hover:bg-yellow-900'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
