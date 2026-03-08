import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { PieceStorePool } from '../piece-store/connection-pool.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pool-test-'));
}

describe('PieceStorePool', () => {
  let dir: string;
  let pool: PieceStorePool;

  beforeEach(() => {
    dir = tmpDir();
    pool = new PieceStorePool(dir, 3);
  });

  afterEach(() => {
    pool.closeAll();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a DB file for a new game', () => {
    pool.get('g1');
    expect(fs.existsSync(pool.dbPath('g1'))).toBe(true);
  });

  it('returns the same store instance on repeated calls', () => {
    const a = pool.get('g1');
    const b = pool.get('g1');
    expect(a).toBe(b);
  });

  it('evicts the LRU entry when pool reaches capacity', () => {
    pool.get('g1');
    pool.get('g2');
    pool.get('g3');
    expect(pool.size).toBe(3);

    // Access g4 — g1 (LRU) should be evicted
    pool.get('g4');
    expect(pool.size).toBe(3);

    // g1 is no longer in pool — next get opens a fresh store
    const g1Again = pool.get('g1');
    expect(g1Again).toBeDefined();
  });

  it('evict() closes and removes the store', () => {
    pool.get('g1');
    expect(pool.size).toBe(1);
    pool.evict('g1');
    expect(pool.size).toBe(0);
  });

  it('closeAll() closes every store', () => {
    pool.get('g1');
    pool.get('g2');
    pool.closeAll();
    expect(pool.size).toBe(0);
  });

  it('persists data across evict+reopen', () => {
    const s1 = pool.get('g1');
    s1.initGame('g1', []);
    pool.evict('g1');

    // Re-open from same file
    const s2 = pool.get('g1');
    expect(s2.getPiecesOnBoard('g1', 'TL0', 1)).toHaveLength(0);
  });
});
