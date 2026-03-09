import path from 'path';
import fs from 'fs';
import { SqlitePieceStore } from './sqlite-adapter.js';

/**
 * Manages per-game SQLite PieceStore instances.
 *
 * Each game gets its own `.db` file under `dataDir/games/<gameId>.db`.
 * The pool keeps at most `maxSize` stores open; the least-recently-used
 * entry is closed when the pool is full.
 */
export class PieceStorePool {
  private readonly dataDir: string;
  private readonly maxSize: number;
  /** Ordered map: key = gameId, value = open store. LRU = first entry. */
  private readonly pool = new Map<string, SqlitePieceStore>();

  constructor(dataDir: string, maxSize = 50) {
    this.dataDir = path.resolve(dataDir);
    this.maxSize = maxSize;
    const gamesDir = path.join(this.dataDir, 'games');
    try {
      fs.mkdirSync(gamesDir, { recursive: true });
    } catch (err) {
      throw new Error(
        `PieceStorePool: failed to create data directory "${gamesDir}": ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  /**
   * Returns the PieceStore for the given game, opening it if necessary.
   * Creates the DB file on first access.
   */
  get(gameId: string): SqlitePieceStore {
    if (this.pool.has(gameId)) {
      // Move to MRU position
      const store = this.pool.get(gameId)!;
      this.pool.delete(gameId);
      this.pool.set(gameId, store);
      return store;
    }

    // Evict LRU if at capacity
    if (this.pool.size >= this.maxSize) {
      const lruKey = this.pool.keys().next().value as string;
      const lruStore = this.pool.get(lruKey)!;
      // Remove from map first so pool stays consistent even if close() throws.
      this.pool.delete(lruKey);
      try {
        lruStore.close();
      } catch (err) {
        throw new Error(
          `PieceStorePool.get("${gameId}"): failed to evict LRU game "${lruKey}": ${(err as Error).message}`,
          { cause: err },
        );
      }
    }

    const dbPath = this._dbPath(gameId);
    let store: SqlitePieceStore;
    try {
      store = new SqlitePieceStore(dbPath);
    } catch (err) {
      throw new Error(
        `PieceStorePool.get("${gameId}"): failed to open "${dbPath}": ${(err as Error).message}`,
        { cause: err },
      );
    }
    this.pool.set(gameId, store);
    return store;
  }

  /**
   * Closes the store for the given game and removes it from the pool.
   * Does nothing if the game is not in the pool.
   */
  evict(gameId: string): void {
    const store = this.pool.get(gameId);
    if (store) {
      // Remove from map first so pool stays consistent even if close() throws.
      this.pool.delete(gameId);
      try {
        store.close();
      } catch (err) {
        throw new Error(
          `PieceStorePool.evict("${gameId}"): failed to close store: ${(err as Error).message}`,
          { cause: err },
        );
      }
    }
  }

  /**
   * Closes and removes all stores. Call on server shutdown.
   * Logs errors but continues closing remaining stores if one fails.
   */
  closeAll(): void {
    const errors: { gameId: string; err: unknown }[] = [];
    for (const [gameId, store] of this.pool.entries()) {
      try { store.close(); } catch (err) { errors.push({ gameId, err }); }
    }
    this.pool.clear();
    if (errors.length > 0) {
      throw new AggregateError(
        errors.map(e => e.err),
        `PieceStorePool.closeAll(): ${errors.length} store(s) failed to close: ${errors.map(e => e.gameId).join(', ')}`,
      );
    }
  }

  /** Absolute path for the given game's DB file. */
  dbPath(gameId: string): string {
    return this._dbPath(gameId);
  }

  get size(): number {
    return this.pool.size;
  }

  private _dbPath(gameId: string): string {
    return path.join(this.dataDir, 'games', `${gameId}.db`);
  }
}
