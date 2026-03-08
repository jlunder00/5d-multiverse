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
    fs.mkdirSync(path.join(this.dataDir, 'games'), { recursive: true });
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
      this.pool.get(lruKey)!.close();
      this.pool.delete(lruKey);
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
      store.close();
      this.pool.delete(gameId);
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
    if (errors.length > 0) console.error('PieceStorePool.closeAll(): errors:', errors);
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
