import { describe, it, expect } from 'vitest';
import { createExecutionOrder, advanceGlobalTurn, getCurrentPlayer } from '../execution-order.js';
import type { PlayerId, Turn } from '@5d/types';

const P = (s: string) => s as PlayerId;
const T = (n: number) => n as Turn;

describe('execution-order', () => {
  describe('createExecutionOrder', () => {
    it('starts with the first player at globalTurn 1', () => {
      const order = createExecutionOrder([P('P1'), P('P2'), P('P3')], T(1));
      expect(getCurrentPlayer(order)).toBe('P1');
      expect(order.globalTurn).toBe(1);
    });

    it('throws when given an empty player list', () => {
      expect(() => createExecutionOrder([], T(1))).toThrow();
    });
  });

  describe('advanceGlobalTurn', () => {
    it('cycles P1 → P2 → P3 → P1 with 3 players', () => {
      let order = createExecutionOrder([P('P1'), P('P2'), P('P3')], T(1));
      expect(getCurrentPlayer(order)).toBe('P1');

      order = advanceGlobalTurn(order);
      expect(getCurrentPlayer(order)).toBe('P2');

      order = advanceGlobalTurn(order);
      expect(getCurrentPlayer(order)).toBe('P3');

      order = advanceGlobalTurn(order);
      // MUST wrap back to P1, not stay on P3 or reset to index 0
      expect(getCurrentPlayer(order)).toBe('P1');
    });

    it('never repeats the same player on consecutive turns with 2 players', () => {
      let order = createExecutionOrder([P('P1'), P('P2')], T(1));
      const seen: string[] = [getCurrentPlayer(order)];

      for (let i = 0; i < 5; i++) {
        order = advanceGlobalTurn(order);
        const prev = seen[seen.length - 1]!;
        expect(getCurrentPlayer(order)).not.toBe(prev);
        seen.push(getCurrentPlayer(order));
      }
    });

    it('increments globalTurn by 1 each time', () => {
      let order = createExecutionOrder([P('P1'), P('P2')], T(1));
      for (let expected = 2; expected <= 6; expected++) {
        order = advanceGlobalTurn(order);
        expect(order.globalTurn).toBe(expected);
      }
    });

    it('cycles correctly over a full round of 3 players (6 turns)', () => {
      const players = [P('P1'), P('P2'), P('P3')];
      const expected = ['P1', 'P2', 'P3', 'P1', 'P2', 'P3'];
      let order = createExecutionOrder(players, T(1));

      for (const name of expected) {
        expect(getCurrentPlayer(order)).toBe(name);
        order = advanceGlobalTurn(order);
      }
    });
  });
});
