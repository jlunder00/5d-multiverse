import { AdjudicationTools, OrderStrength } from '@5d/types';

export function createAdjudicationTools(): AdjudicationTools {
  return {
    computeStrengths(
      orders: unknown[],
      countSupport: (order: unknown, allOrders: unknown[]) => number,
    ): OrderStrength[] {
      // First pass: compute raw support counts for every order
      const supports = orders.map((order) => countSupport(order, orders));

      // Second pass: detect standoffs — orders targeting the same destination
      // with equal strength are in standoff. Plugin-provided orders are opaque,
      // so we group by the string representation of their destination field.
      const destStrength = new Map<string, number[]>();
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i] as Record<string, unknown>;
        const dest = JSON.stringify(order['to'] ?? order['destination'] ?? i);
        const bucket = destStrength.get(dest) ?? [];
        bucket.push(supports[i] ?? 0);
        destStrength.set(dest, bucket);
      }

      return orders.map((order, i) => {
        const o = order as Record<string, unknown>;
        const dest = JSON.stringify(o['to'] ?? o['destination'] ?? i);
        const bucket = destStrength.get(dest) ?? [];
        const myStrength = supports[i] ?? 0;
        const standoff = bucket.length > 1 && bucket.every((s) => s === myStrength);

        const actionId = typeof o['id'] === 'string' ? o['id'] : String(i);
        return {
          actionId,
          supportCount: myStrength,
          standoff,
        } satisfies OrderStrength;
      });
    },
  };
}
