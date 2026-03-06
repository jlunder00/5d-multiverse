import { IGameDefinition } from '@5d/types';

const registry = new Map<string, IGameDefinition>();

export function registerPlugin(def: IGameDefinition): void {
  if (registry.has(def.gameId)) {
    throw new Error(`Plugin already registered: ${def.gameId}`);
  }
  registry.set(def.gameId, def);
}

export function getPlugin(gameId: string): IGameDefinition {
  const def = registry.get(gameId);
  if (!def) throw new Error(`No plugin registered for gameId: ${gameId}`);
  return def;
}

export function listPlugins(): string[] {
  return [...registry.keys()];
}
