import { z } from 'zod';

/**
 * A coordinate in the 5D multiverse.
 *
 * timeline: branch identifier (e.g. "T1", "T2L", "T2R")
 * turn:     global turn number (1-based)
 * region:   game-specific region/territory/hex identifier
 *
 * The full 5D address of a piece is (timeline, turn, region).
 * Lateral movement = same turn, different timeline.
 * Temporal movement = same timeline, different turn (not supported in-game; handled by branch).
 */
export const TimelineIdSchema = z.string().brand<'TimelineId'>();
export type TimelineId = z.infer<typeof TimelineIdSchema>;

export const RegionIdSchema = z.string().brand<'RegionId'>();
export type RegionId = z.infer<typeof RegionIdSchema>;

export const TurnSchema = z.number().int().positive();
export type Turn = z.infer<typeof TurnSchema>;

export const LocationSchema = z.object({
  timeline: TimelineIdSchema,
  turn: TurnSchema,
  region: RegionIdSchema,
});
export type Location = z.infer<typeof LocationSchema>;

/** Uniquely identifies a board (one snapshot per timeline per turn). */
export const BoardAddressSchema = z.object({
  timeline: TimelineIdSchema,
  turn: TurnSchema,
});
export type BoardAddress = z.infer<typeof BoardAddressSchema>;

export function locationKey(loc: Location): string {
  return `${loc.timeline}:${loc.turn}:${loc.region}`;
}

export function boardKey(addr: BoardAddress): string {
  return `${addr.timeline}:${addr.turn}`;
}
