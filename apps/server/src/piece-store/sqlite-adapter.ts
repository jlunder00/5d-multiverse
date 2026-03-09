import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  PieceStore,
  TurnTransaction,
  BranchCreationParams,
  PieceState,
  PieceInfo,
  HistoricalPieceInfo,
  SpacetimeCoord,
  RealPieceId,
} from '@5d/types';
import { PIECE_STORE_SCHEMA } from './schema.js';

// ── Internal row types ────────────────────────────────────────────────────────

interface PieceRow {
  game_id: string;
  real_piece_id: string;
  owner: string;
  type: string;
  data: string;
}

interface PresentRow {
  game_id: string;
  timeline: string;
  turn: number;
  region: string;
  owner: string;
  type: string;
  disambiguator: number;
  real_piece_id: string;
}

interface HistoricalRow {
  game_id: string;
  timeline: string;
  turn: number;
  region: string;
  owner: string;
  type: string;
  disambiguator: number;
  data: string;
}

interface LocationRow {
  game_id: string;
  real_piece_id: string;
  timeline: string;
  turn: number;
  region: string;
  disambiguator: number;
}

// ── SqliteTurnTransaction ─────────────────────────────────────────────────────

class SqliteTurnTransaction implements TurnTransaction {
  private readonly db: Database.Database;
  private state: 'open' | 'committed' | 'rolledBack' = 'open';

  constructor(db: Database.Database) {
    this.db = db;
    try {
      db.prepare('BEGIN').run();
    } catch (err) {
      this.state = 'rolledBack'; // prevent [Symbol.dispose] from issuing ROLLBACK
      throw new Error(`SqliteTurnTransaction: failed to BEGIN: ${(err as Error).message}`, { cause: err });
    }
  }

  savepoint(name: string): void {
    if (!/^\w+$/.test(name)) throw new Error(`Invalid savepoint name: "${name}"`);
    this.db.prepare(`SAVEPOINT "${name}"`).run();
  }

  rollbackTo(name: string): void {
    if (!/^\w+$/.test(name)) throw new Error(`Invalid savepoint name: "${name}"`);
    this.db.prepare(`ROLLBACK TO SAVEPOINT "${name}"`).run();
  }

  commit(): void {
    if (this.state !== 'open') throw new Error(`TurnTransaction.commit(): transaction already ${this.state}`);
    this.db.prepare('COMMIT').run();
    this.state = 'committed';
  }

  rollback(): void {
    if (this.state !== 'open') throw new Error(`TurnTransaction.rollback(): transaction already ${this.state}`);
    this.db.prepare('ROLLBACK').run();
    this.state = 'rolledBack';
  }

  [Symbol.dispose](): void {
    if (this.state === 'open') this.rollback();
  }
}

// ── SqlitePieceStore ──────────────────────────────────────────────────────────

/**
 * PieceStore implementation backed by a single SQLite database.
 *
 * Multiple games can share one in-memory DB (used in tests) because each
 * table has a `game_id` partition column. For production, pass a file path
 * (per-game or shared).
 */
export class SqlitePieceStore implements PieceStore {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    try {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.exec(PIECE_STORE_SCHEMA);
    } catch (err) {
      this.db.close();
      throw new Error(
        `SqlitePieceStore: failed to init "${dbPath}": ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  private _closed = false;

  close(): void {
    if (this._closed) return;
    try {
      this.db.close();
    } catch (err) {
      throw new Error(`SqlitePieceStore.close() failed: ${(err as Error).message}`, { cause: err });
    } finally {
      this._closed = true;
    }
  }

  // ── Board queries ───────────────────────────────────────────────────────────

  getPiecesOnBoard(gameId: string, timeline: string, turn: number): PieceInfo[] {
    const rows = this.db.prepare<[string, string, number], PresentRow & { piece_data: string }>(
      `SELECT pp.*, p.data AS piece_data
       FROM present_positions pp
       JOIN pieces p ON p.game_id = pp.game_id AND p.real_piece_id = pp.real_piece_id
       WHERE pp.game_id = ? AND pp.timeline = ? AND pp.turn = ?
       ORDER BY pp.region, pp.owner, pp.type, pp.disambiguator`
    ).all(gameId, timeline, turn);

    return rows.map(r => ({
      realPieceId: r.real_piece_id as RealPieceId,
      owner: r.owner as PieceInfo['owner'],
      type: r.type as PieceInfo['type'],
      region: r.region as PieceInfo['region'],
      disambiguator: r.disambiguator,
      data: JSON.parse(r.piece_data) as Record<string, unknown>,
    }));
  }

  getHistoricalPieces(gameId: string, timeline: string, turn: number): HistoricalPieceInfo[] {
    const rows = this.db.prepare<[string, string, number], HistoricalRow>(
      `SELECT * FROM historical_snapshots
       WHERE game_id = ? AND timeline = ? AND turn = ?
       ORDER BY region, owner, type, disambiguator`
    ).all(gameId, timeline, turn);

    return rows.map(r => ({
      owner: r.owner as HistoricalPieceInfo['owner'],
      type: r.type as HistoricalPieceInfo['type'],
      region: r.region as HistoricalPieceInfo['region'],
      disambiguator: r.disambiguator,
      data: JSON.parse(r.data) as Record<string, unknown>,
    }));
  }

  getPieceLocation(gameId: string, realPieceId: RealPieceId): SpacetimeCoord | undefined {
    const row = this.db.prepare<[string, string], LocationRow>(
      `SELECT pl.*, pp.owner, pp.type FROM piece_locations pl
       JOIN present_positions pp
         ON pp.game_id = pl.game_id AND pp.real_piece_id = pl.real_piece_id
        AND pp.timeline = pl.timeline AND pp.turn = pl.turn AND pp.region = pl.region
        AND pp.disambiguator = pl.disambiguator
       WHERE pl.game_id = ? AND pl.real_piece_id = ?`
    ).get(gameId, realPieceId) as (LocationRow & { owner: string; type: string }) | undefined;

    if (!row) return undefined;

    return {
      timeline: row.timeline,
      turn: row.turn,
      region: row.region as SpacetimeCoord['region'],
      owner: row.owner as SpacetimeCoord['owner'],
      type: row.type as SpacetimeCoord['type'],
      disambiguator: row.disambiguator,
    };
  }

  getPieceState(gameId: string, realPieceId: RealPieceId): PieceState | undefined {
    const row = this.db.prepare<[string, string], PieceRow>(
      `SELECT * FROM pieces WHERE game_id = ? AND real_piece_id = ?`
    ).get(gameId, realPieceId);

    if (!row) return undefined;

    return {
      id: row.real_piece_id as RealPieceId,
      owner: row.owner as PieceState['owner'],
      type: row.type as PieceState['type'],
      data: JSON.parse(row.data) as Record<string, unknown>,
    };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  movePiece(gameId: string, realPieceId: RealPieceId, newCoord: Partial<SpacetimeCoord>): void {
    const { region, timeline, turn } = newCoord;
    if (region === undefined && timeline === undefined && turn === undefined) {
      throw new Error(`movePiece: newCoord has no fields set for piece "${realPieceId}" in game "${gameId}"`);
    }

    // Build a single UPDATE for atomicity — avoids intermediate PK violations
    // when multiple fields change simultaneously (e.g., region + timeline).
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (region !== undefined)   { sets.push('region = ?');   vals.push(region); }
    if (timeline !== undefined) { sets.push('timeline = ?'); vals.push(timeline); }
    if (turn !== undefined)     { sets.push('turn = ?');     vals.push(turn); }

    const rpp = this.db.prepare(
      `UPDATE present_positions SET ${sets.join(', ')} WHERE game_id = ? AND real_piece_id = ?`
    ).run(...(vals as string[]), gameId, realPieceId);
    if (rpp.changes === 0) throw new Error(`movePiece: piece "${realPieceId}" not found in present_positions for game "${gameId}"`);

    const rpl = this.db.prepare(
      `UPDATE piece_locations SET ${sets.join(', ')} WHERE game_id = ? AND real_piece_id = ?`
    ).run(...(vals as string[]), gameId, realPieceId);
    if (rpl.changes === 0) throw new Error(`movePiece: piece "${realPieceId}" missing from piece_locations for game "${gameId}" (present_positions already updated — roll back this transaction)`);
  }

  updatePieceData(gameId: string, realPieceId: RealPieceId, data: Record<string, unknown>): void {
    const current = this._pieceData(gameId, realPieceId);
    const merged = { ...current, ...data };
    const r = this.db.prepare(
      `UPDATE pieces SET data = ? WHERE game_id = ? AND real_piece_id = ?`
    ).run(JSON.stringify(merged), gameId, realPieceId);
    if (r.changes === 0) throw new Error(`updatePieceData: piece "${realPieceId}" disappeared between read and write in game "${gameId}"`);
  }

  removePiece(gameId: string, realPieceId: RealPieceId): void {
    const r = this.db.prepare(
      `DELETE FROM present_positions WHERE game_id = ? AND real_piece_id = ?`
    ).run(gameId, realPieceId);
    if (r.changes === 0) throw new Error(`removePiece: piece "${realPieceId}" not found in present_positions for game "${gameId}"`);

    this.db.prepare(
      `DELETE FROM piece_locations WHERE game_id = ? AND real_piece_id = ?`
    ).run(gameId, realPieceId);
    // Keep pieces row: (1) present_positions on other timelines still references it via FK;
    // (2) callers may call getPieceState to retrieve the last known state of a removed piece.
  }

  addPiece(gameId: string, state: PieceState, coord: SpacetimeCoord): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO pieces (game_id, real_piece_id, owner, type, data)
       VALUES (?, ?, ?, ?, ?)`
    ).run(gameId, state.id, state.owner, state.type, JSON.stringify(state.data));

    this.db.prepare(
      `INSERT OR REPLACE INTO present_positions
         (game_id, timeline, turn, region, owner, type, disambiguator, real_piece_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(gameId, coord.timeline, coord.turn, coord.region, coord.owner, coord.type,
      coord.disambiguator, state.id);

    this.db.prepare(
      `INSERT OR REPLACE INTO piece_locations
         (game_id, real_piece_id, timeline, turn, region, disambiguator)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(gameId, state.id, coord.timeline, coord.turn, coord.region, coord.disambiguator);
  }

  // ── Turn lifecycle ─────────────────────────────────────────────────────────

  advanceAllTimelines(gameId: string, timelines: { timeline: string; fromTurn: number }[]): void {
    const advanceOne = (tl: string, fromTurn: number) => {
      const nextTurn = fromTurn + 1;

      // 1. Write historical snapshots (compacted disambiguators)
      const presentRows = this.db.prepare<[string, string, number], PresentRow>(
        `SELECT pp.*, p.data as piece_data FROM present_positions pp
         JOIN pieces p ON p.game_id = pp.game_id AND p.real_piece_id = pp.real_piece_id
         WHERE pp.game_id = ? AND pp.timeline = ? AND pp.turn = ?
         ORDER BY region, owner, type, disambiguator`
      ).all(gameId, tl, fromTurn) as (PresentRow & { piece_data: string })[];

      // Group by (region, owner, type) for compaction
      const groups = new Map<string, (PresentRow & { piece_data: string })[]>();
      for (const row of presentRows) {
        const key = `${row.region}|${row.owner}|${row.type}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      const insertSnapshot = this.db.prepare(
        `INSERT OR REPLACE INTO historical_snapshots
           (game_id, timeline, turn, region, owner, type, disambiguator, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const insertPresent = this.db.prepare(
        `INSERT OR REPLACE INTO present_positions
           (game_id, timeline, turn, region, owner, type, disambiguator, real_piece_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const updateLocation = this.db.prepare(
        `UPDATE piece_locations SET turn = ? WHERE game_id = ? AND real_piece_id = ?`
      );

      for (const rows of groups.values()) {
        rows.forEach((row, i) => {
          // Snapshot for outgoing turn
          insertSnapshot.run(gameId, tl, fromTurn, row.region, row.owner, row.type, i, row.piece_data);
          // New present for next turn
          insertPresent.run(gameId, tl, nextTurn, row.region, row.owner, row.type, i, row.real_piece_id);
          updateLocation.run(nextTurn, gameId, row.real_piece_id);
        });
      }

      // 3. Delete old present rows
      this.db.prepare(
        `DELETE FROM present_positions WHERE game_id = ? AND timeline = ? AND turn = ?`
      ).run(gameId, tl, fromTurn);
    };

    const advanceAll = this.db.transaction(() => {
      for (const { timeline, fromTurn } of timelines) {
        try {
          advanceOne(timeline, fromTurn);
        } catch (err) {
          throw new Error(
            `advanceAllTimelines: failed on timeline "${timeline}" fromTurn ${fromTurn}: ${(err as Error).message}`,
            { cause: err },
          );
        }
      }
    });
    advanceAll();
  }

  createBranch(gameId: string, params: BranchCreationParams): void {
    const { originTimeline, originTurn, newTimelineId, travelerId, travelerDestRegion } = params;

    const create = this.db.transaction(() => {
      // 1. Fetch historical snapshot for the origin board
      const snapshots = this.db.prepare<[string, string, number], HistoricalRow>(
        `SELECT * FROM historical_snapshots
         WHERE game_id = ? AND timeline = ? AND turn = ?
         ORDER BY region, owner, type, disambiguator`
      ).all(gameId, originTimeline, originTurn);

      // Precondition guards
      const travelerState = this.getPieceState(gameId, travelerId);
      if (!travelerState) throw new Error(`createBranch: travelerId "${travelerId}" not in pieces table`);

      const sourceLoc = this.db.prepare<[string, string], LocationRow>(
        `SELECT * FROM piece_locations WHERE game_id = ? AND real_piece_id = ?`
      ).get(gameId, travelerId);
      if (!sourceLoc) throw new Error(`createBranch: no piece_locations entry for "${travelerId}"`);

      if (snapshots.length === 0) {
        throw new Error(`createBranch: no historical snapshot at (${originTimeline}, ${originTurn})`);
      }

      // 2. Bootstrap new timeline: mint new RealPieceIds for each snapshot piece
      //    except the traveler (which keeps its own ID)
      const insertPiece = this.db.prepare(
        `INSERT OR IGNORE INTO pieces (game_id, real_piece_id, owner, type, data)
         VALUES (?, ?, ?, ?, ?)`
      );
      const insertPresent = this.db.prepare(
        `INSERT OR REPLACE INTO present_positions
           (game_id, timeline, turn, region, owner, type, disambiguator, real_piece_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertLocation = this.db.prepare(
        `INSERT OR REPLACE INTO piece_locations
           (game_id, real_piece_id, timeline, turn, region, disambiguator)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      let travelerPlaced = false;

      for (const snap of snapshots) {
        // Match snapshot row to traveler slot by (region, owner, type, disambiguator)
        // using the source location captured before any writes.
        // Match on (region, owner, type, disambiguator). region+disambiguator alone is not
        // unique — multiple pieces can share a region with the same disambiguator but different
        // owner/type. owner and type come from travelerState (current pieces row) because
        // piece_locations doesn't store them; they're safe to use because owner and type are
        // immutable via the PieceStore API (only settable at addPiece time).
        const isTravelerSlot =
          snap.region === sourceLoc.region &&
          snap.owner === travelerState.owner &&
          snap.type === travelerState.type &&
          snap.disambiguator === sourceLoc.disambiguator;

        if (isTravelerSlot) {
          // Traveler goes to dest region on new timeline — keeps its own ID
          insertPresent.run(
            gameId, newTimelineId, originTurn,
            travelerDestRegion, snap.owner, snap.type, snap.disambiguator, travelerId,
          );
          insertLocation.run(
            gameId, travelerId, newTimelineId, originTurn,
            travelerDestRegion, snap.disambiguator,
          );
          travelerPlaced = true;
        } else {
          // Bootstrap: mint a new RealPieceId for this historical piece
          const newId = randomUUID() as RealPieceId;
          insertPiece.run(gameId, newId, snap.owner, snap.type, snap.data);
          insertPresent.run(
            gameId, newTimelineId, originTurn,
            snap.region, snap.owner, snap.type, snap.disambiguator, newId,
          );
          insertLocation.run(
            gameId, newId, newTimelineId, originTurn, snap.region, snap.disambiguator,
          );
        }
      }

      if (!travelerPlaced) {
        throw new Error(
          `createBranch: traveler slot not found in snapshot at (${originTimeline}, ${originTurn}). ` +
          `Traveler "${travelerId}": sourceLoc=(region=${sourceLoc.region}, dis=${sourceLoc.disambiguator}), ` +
          `owner=${travelerState.owner}, type=${travelerState.type}. ` +
          `Snapshot had ${snapshots.length} row(s).`,
        );
      }

      // 3. Remove traveler from its SOURCE board only (not from the new timeline)
      this.db.prepare(
        `DELETE FROM present_positions
         WHERE game_id = ? AND real_piece_id = ? AND timeline = ? AND turn = ?`
      ).run(gameId, travelerId, sourceLoc.timeline, sourceLoc.turn);
      // piece_locations for the traveler was already updated by insertLocation above
    });

    create();
  }

  // ── Transaction management ─────────────────────────────────────────────────

  beginTurn(_gameId: string): TurnTransaction {
    return new SqliteTurnTransaction(this.db);
  }

  initGame(gameId: string, initialPieces: { state: PieceState; coord: SpacetimeCoord }[]): void {
    const init = this.db.transaction(() => {
      for (const { state, coord } of initialPieces) {
        this.addPiece(gameId, state, coord);
      }
    });
    init();
  }

  deleteGame(gameId: string): void {
    const del = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM piece_locations WHERE game_id = ?`).run(gameId);
      this.db.prepare(`DELETE FROM present_positions WHERE game_id = ?`).run(gameId);
      this.db.prepare(`DELETE FROM historical_snapshots WHERE game_id = ?`).run(gameId);
      this.db.prepare(`DELETE FROM pieces WHERE game_id = ?`).run(gameId);
    });
    del();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _pieceData(gameId: string, realPieceId: string): Record<string, unknown> {
    const row = this.db.prepare<[string, string], { data: string }>(
      `SELECT data FROM pieces WHERE game_id = ? AND real_piece_id = ?`
    ).get(gameId, realPieceId);
    if (!row) throw new Error(`_pieceData: piece "${realPieceId}" not found in game "${gameId}"`);
    return JSON.parse(row.data) as Record<string, unknown>;
  }
}
