import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { PieceStorePool } from '../piece-store/connection-pool.js';
import type { PieceState, SpacetimeCoord } from '@5d/types';

function pid(s: string) { return s as PieceState['id']; }
function mkState(id: string): PieceState {
  return { id: pid(id), owner: 'p1' as PieceState['owner'], type: 'inf' as PieceState['type'], data: {} };
}
function mkCoord(tl: string, turn: number, region: string): SpacetimeCoord {
  return {
    timeline: tl, turn, region: region as SpacetimeCoord['region'],
    owner: 'p1' as SpacetimeCoord['owner'], type: 'inf' as SpacetimeCoord['type'], disambiguator: 0,
  };
}

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

  it('accessing an existing entry promotes it to MRU (not evicted next)', () => {
    const g1ref = pool.get('g1');
    pool.get('g2');
    pool.get('g3');

    // Promote g1 to MRU
    pool.get('g1');

    // Add g4 — g2 (now LRU) should be evicted, not g1
    pool.get('g4');
    expect(pool.size).toBe(3);

    // g1 is still in pool (was MRU-promoted) — same store instance
    expect(pool.get('g1')).toBe(g1ref);
  });

  it('LRU eviction failure removes the stale entry from pool and re-throws', () => {
    const s1 = pool.get('g1'); // LRU
    pool.get('g2');
    pool.get('g3'); // MRU
    // Patch close() to simulate a storage failure
    (s1 as unknown as { close(): void }).close = () => { throw new Error('fake close failure'); };

    // Adding g4 triggers LRU eviction of g1 — should throw
    expect(() => pool.get('g4')).toThrow(/failed to evict/);
    // g1 was removed from the map before close() was attempted
    expect(pool.size).toBe(2);
  });

  it('evict() removes entry from pool even when close() throws', () => {
    const s1 = pool.get('g1');
    pool.get('g2');
    (s1 as unknown as { close(): void }).close = () => { throw new Error('fake close failure'); };

    expect(() => pool.evict('g1')).toThrow(/failed to close/);
    // g1 was removed from the map before close() was called
    expect(pool.size).toBe(1);
  });

  it('closeAll() clears pool and throws AggregateError when any store fails to close', () => {
    const s1 = pool.get('g1');
    pool.get('g2');
    (s1 as unknown as { close(): void }).close = () => { throw new Error('fake close failure'); };

    let thrown: unknown;
    try {
      pool.closeAll();
    } catch (err) {
      thrown = err;
    }

    expect(pool.size).toBe(0); // pool cleared regardless
    expect(thrown).toBeInstanceOf(AggregateError);
  });

  it('deleteGame on one game does not affect another game in the same store', () => {
    const s = pool.get('gx');
    s.initGame('game-A', [{ state: mkState('pA'), coord: mkCoord('TL0', 1, 'R1') }]);
    s.initGame('game-B', [{ state: mkState('pB'), coord: mkCoord('TL0', 1, 'R1') }]);

    s.deleteGame('game-A');

    expect(s.getPiecesOnBoard('game-A', 'TL0', 1)).toHaveLength(0);
    expect(s.getPiecesOnBoard('game-B', 'TL0', 1)).toHaveLength(1);
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
