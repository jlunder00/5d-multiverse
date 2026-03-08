import { z } from 'zod';
import { RegionIdSchema, RegionId } from './coordinates.js';

export const PlayerIdSchema = z.string().brand<'PlayerId'>();
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const UnitTypeIdSchema = z.string().brand<'UnitTypeId'>();
export type UnitTypeId = z.infer<typeof UnitTypeIdSchema>;

/** Stable unique ID assigned once at piece creation. Never changes across time travel. */
export type RealPieceId = string & { readonly __brand: 'RealPieceId' };
export const RealPieceIdSchema = z.string().transform((s) => s as RealPieceId);

/** All mutable piece state. Stored in the `pieces` SQL table. */
export interface PieceState {
  id:    RealPieceId;
  owner: PlayerId;
  type:  UnitTypeId;
  /** Plugin-defined extra data (health, movesUsed, etc.). */
  data:  Record<string, unknown>;
}

/** Full multiverse coordinate — identifies one slot on one board. */
export interface SpacetimeCoord {
  timeline:      string;
  turn:          number;
  region:        RegionId;
  owner:         PlayerId;
  type:          UnitTypeId;
  /** 0-based index distinguishing identical pieces at the same (timeline, turn, region). */
  disambiguator: number;
}

/** What a plugin sees when it inspects a board. Replaces the old Entity Map. */
export interface PieceInfo {
  realPieceId:   RealPieceId;
  owner:         PlayerId;
  type:          UnitTypeId;
  region:        RegionId;
  disambiguator: number;
  data:          Record<string, unknown>;
}

/**
 * Positional snapshot of a piece that has time-traveled away.
 * Stored in historical_snapshots; has no back-reference to the living piece.
 */
export interface HistoricalPieceInfo {
  owner:         PlayerId;
  type:          UnitTypeId;
  region:        RegionId;
  disambiguator: number;
  data:          Record<string, unknown>;
}

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
