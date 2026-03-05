import { z } from 'zod';
import { LocationSchema, RegionIdSchema } from './coordinates.js';

export const PlayerIdSchema = z.string().brand<'PlayerId'>();
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const UnitTypeIdSchema = z.string().brand<'UnitTypeId'>();
export type UnitTypeId = z.infer<typeof UnitTypeIdSchema>;

export const EntityIdSchema = z.string().brand<'EntityId'>();
export type EntityId = z.infer<typeof EntityIdSchema>;

/** A single piece/unit on the board. */
export const EntitySchema = z.object({
  id: EntityIdSchema,
  owner: PlayerIdSchema,
  type: UnitTypeIdSchema,
  location: LocationSchema,
  /** Game-specific extra data (army count, health, etc.) */
  data: z.record(z.string(), z.unknown()),
});
export type Entity = z.infer<typeof EntitySchema>;

/** A region/territory/hex on the map. */
export const RegionStateSchema = z.object({
  id: RegionIdSchema,
  /** Which player controls this region (if applicable). */
  owner: PlayerIdSchema.nullable(),
  /** Game-specific per-region data (resource type, buildings, armies). */
  data: z.record(z.string(), z.unknown()),
});
export type RegionState = z.infer<typeof RegionStateSchema>;

/** Per-timeline economy for one player. */
export const EconomySchema = z.object({
  player: PlayerIdSchema,
  /** Named resource pools: gold, ore, wheat, IPC, etc. */
  resources: z.record(z.string(), z.number()),
});
export type Economy = z.infer<typeof EconomySchema>;
