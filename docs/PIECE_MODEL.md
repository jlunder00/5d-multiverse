# Piece Model — Design Spec

## Overview

The engine tracks pieces using two complementary layers:

1. **Real Piece ID** — a stable unique identifier that follows a piece through its entire
   existence, regardless of where it moves in the multiverse.
2. **Spacetime Coordinate Index** — a SQLite database that maps a position in the
   multiverse to the Real Piece ID (or a frozen historical snapshot) occupying that
   position, and serves as the authoritative runtime store.

SQLite is used as both the runtime data store and the persistence layer. There is no
separate in-memory trie — the indexed SQL tables are the index structure. Serialisation
and undo are handled by the database directly.

---

## Layer 1 — Real Piece (`RealPieceId` + `PieceState`)

### Identity

Each piece is assigned a `RealPieceId` exactly once at creation. This ID never changes.

Creation events:
- Game initialisation (pieces defined by `createInitialBoard`)
- In-game production (Risk deployment, Catan build, A&A purchase, etc.)
- Timeline crystallisation — when a pending branch crystallises, each historical snapshot
  at the branch's origin board mints a new `RealPieceId` for the new timeline's present
  (see Branch Creation below)

The traveling piece — the one that crossed a timeline boundary to trigger the branch —
**keeps its existing `RealPieceId`**. It is not re-minted.

### State

```
PieceState {
  id:        RealPieceId   // stable, never mutated
  owner:     PlayerId
  type:      UnitTypeId
  data:      JSON          // plugin-defined: health, attack, movement budget, etc.
}
```

`PieceState` lives in the `pieces` table (see Schema below). Within-turn fields (movement
used, fired-this-turn flags, etc.) live inside `data`. The engine does not interpret
`data` — resetting within-turn fields at turn-start is entirely plugin responsibility,
handled via a turn-start hook.

---

## Layer 2 — Spacetime Coordinate Index (SQLite)

### Schema

```sql
-- Authoritative piece state. One row per real piece, ever.
CREATE TABLE pieces (
  game_id       TEXT    NOT NULL,
  real_piece_id TEXT    NOT NULL,
  owner         TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  data          TEXT    NOT NULL DEFAULT '{}',  -- JSON
  PRIMARY KEY (game_id, real_piece_id)
);

-- Present board: maps a multiverse coordinate to a live real piece.
-- One row per piece per present board. Rows are updated as pieces move
-- and compacted (disambiguators reassigned) at each turn advance.
CREATE TABLE present_positions (
  game_id       TEXT    NOT NULL,
  timeline      TEXT    NOT NULL,
  turn          INTEGER NOT NULL,
  region        TEXT    NOT NULL,
  owner         TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  disambiguator INTEGER NOT NULL DEFAULT 0,
  real_piece_id TEXT    NOT NULL,
  PRIMARY KEY (game_id, timeline, turn, region, owner, type, disambiguator),
  FOREIGN KEY (game_id, real_piece_id) REFERENCES pieces(game_id, real_piece_id)
);

-- Historical board: frozen snapshot of a piece's state at turn-start.
-- Written once at turn advance. Never updated.
CREATE TABLE historical_snapshots (
  game_id       TEXT    NOT NULL,
  timeline      TEXT    NOT NULL,
  turn          INTEGER NOT NULL,
  region        TEXT    NOT NULL,
  owner         TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  disambiguator INTEGER NOT NULL DEFAULT 0,
  data          TEXT    NOT NULL DEFAULT '{}',  -- JSON, frozen at turn boundary
  PRIMARY KEY (game_id, timeline, turn, region, owner, type, disambiguator)
);

-- Reverse index: find a live piece's current coordinate in O(1).
-- Maintained in sync with present_positions.
CREATE TABLE piece_locations (
  game_id       TEXT    NOT NULL,
  real_piece_id TEXT    NOT NULL,
  timeline      TEXT    NOT NULL,
  turn          INTEGER NOT NULL,
  region        TEXT    NOT NULL,
  disambiguator INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, real_piece_id)
);

-- Supporting indexes for common query patterns.
CREATE INDEX idx_present_board   ON present_positions(game_id, timeline, turn);
CREATE INDEX idx_present_region  ON present_positions(game_id, timeline, turn, region);
CREATE INDEX idx_snapshot_board  ON historical_snapshots(game_id, timeline, turn);
```

### Present vs. historical rows

- **`present_positions`**: always contains exactly the latest turn of each timeline.
  Rows reference live `real_piece_id` values. Updated when pieces move; compacted
  (disambiguators re-assigned 0, 1, 2…) at turn advance.
- **`historical_snapshots`**: contains every past turn of every timeline. Rows are
  frozen copies of piece state at the turn boundary. Never updated after insertion.
  Referenced only for branching (to bootstrap new timelines) and for display.

### Disambiguation

The `disambiguator` integer distinguishes multiple pieces of the same
`(timeline, turn, region, owner, type)` on a single board. Within a turn, slots are
stable — if a piece leaves mid-turn, its slot is vacated but other slots do not shift.
At turn advance, survivors are compacted (re-slotted 0, 1, 2…) in the new present board
and in the snapshot written for the outgoing turn.

---

## Undo System

Undo is handled entirely by SQLite transactions. No separate undo stack or staging area
is needed.

```
Turn start      →  BEGIN outer transaction
Before action N →  SAVEPOINT action_N
Action applied  →  SQL writes execute
Player undoes   →  ROLLBACK TO SAVEPOINT action_N  (all writes since savepoint reversed)
Turn submitted  →  RELEASE all savepoints, COMMIT outer transaction
```

This gives arbitrary undo depth within a turn at zero implementation cost. The savepoints
are nested inside the outer turn transaction, so an abandoned turn (disconnect, timeout)
is automatically rolled back.

---

## Historical Snapshots

### When they are written

At the **turn boundary, before any player actions begin**. `advanceAllTimelines`:

1. For each timeline's current present board (timeline, T):
   a. INSERT one row into `historical_snapshots` per piece, copying `owner`, `type`,
      and `data` from the `pieces` table. This is the frozen turn-start state.
   b. INSERT rows into `present_positions` for the new board (timeline, T+1), pointing
      to the same `real_piece_id` values, with disambiguators compacted.
   c. UPDATE `piece_locations` for each piece to (timeline, T+1).
2. Plugin turn-start hook runs: may UPDATE `pieces.data` to reset within-turn fields.

All of the above runs inside a single transaction — one disk sync regardless of board
count or piece count.

Historical snapshots are immutable once written. The engine never UPDATEs or DELETEs
rows in `historical_snapshots`.

---

## Operations

### Move (within a board)

```sql
-- 1. Find the piece (already known from click — coordinate is fully specified)
-- 2. Update present_positions
UPDATE present_positions
SET region = :newRegion
WHERE game_id = :gameId AND timeline = :tl AND turn = :turn
  AND real_piece_id = :realPieceId;

-- 3. Update reverse index
UPDATE piece_locations
SET region = :newRegion
WHERE game_id = :gameId AND real_piece_id = :realPieceId;

-- 4. Update piece state (e.g. increment movesUsed)
UPDATE pieces
SET data = json_patch(data, :dataDiff)
WHERE game_id = :gameId AND real_piece_id = :realPieceId;
```

All three statements run inside the current turn transaction (under the action's
savepoint). Undo via `ROLLBACK TO SAVEPOINT` reverses all three atomically.

### Turn Advance (`advanceAllTimelines`)

```sql
BEGIN;

-- 1. Write historical snapshots for all present boards
INSERT INTO historical_snapshots (game_id, timeline, turn, region, owner, type, disambiguator, data)
SELECT pp.game_id, pp.timeline, pp.turn, pp.region, pp.owner, pp.type,
       ROW_NUMBER() OVER (
         PARTITION BY pp.game_id, pp.timeline, pp.turn, pp.region, pp.owner, pp.type
         ORDER BY pp.disambiguator
       ) - 1 AS disambiguator,
       p.data
FROM present_positions pp
JOIN pieces p USING (game_id, real_piece_id)
WHERE pp.game_id = :gameId;

-- 2. Insert new present board rows (turn + 1) with compacted disambiguators
INSERT INTO present_positions (game_id, timeline, turn, region, owner, type, disambiguator, real_piece_id)
SELECT game_id, timeline, turn + 1, region, owner, type,
       ROW_NUMBER() OVER (
         PARTITION BY game_id, timeline, region, owner, type
         ORDER BY disambiguator
       ) - 1,
       real_piece_id
FROM present_positions
WHERE game_id = :gameId;

-- 3. Delete old present board rows
DELETE FROM present_positions
WHERE game_id = :gameId AND turn = :oldTurn;

-- 4. Update reverse index
UPDATE piece_locations SET turn = turn + 1
WHERE game_id = :gameId;

COMMIT;
```

### Branch Creation (time travel to a new timeline)

1. **Remove traveler from source board**: DELETE its `present_positions` row and UPDATE
   `piece_locations` to mark it in-transit (or insert at the new coordinate directly).

2. **Bootstrap new timeline's present board** from the origin board's `historical_snapshots`:
   ```sql
   -- Mint new real_piece_ids and insert into pieces + present_positions
   INSERT INTO pieces (game_id, real_piece_id, owner, type, data)
   SELECT :gameId, :newRealPieceId, owner, type, data
   FROM historical_snapshots
   WHERE game_id = :gameId AND timeline = :originTl AND turn = :originTurn;

   INSERT INTO present_positions (game_id, timeline, turn, region, owner, type, disambiguator, real_piece_id)
   SELECT :gameId, :newTl, :originTurn, region, owner, type, disambiguator, :newRealPieceId
   FROM historical_snapshots
   WHERE game_id = :gameId AND timeline = :originTl AND turn = :originTurn;
   ```
   (One new `RealPieceId` minted per snapshot row; mapping tracked during iteration.)

3. **Place the traveler** on the new timeline:
   ```sql
   INSERT INTO present_positions (game_id, timeline, turn, region, owner, type, disambiguator, real_piece_id)
   VALUES (:gameId, :newTl, :originTurn, :destRegion, :owner, :type, :n, :travelerRealPieceId);

   UPDATE piece_locations SET timeline = :newTl, turn = :originTurn, region = :destRegion
   WHERE game_id = :gameId AND real_piece_id = :travelerRealPieceId;
   ```

4. Subsequent arrivals (additional pieces through the same window) execute step 3 only.
   The bootstrap (step 2) runs exactly once per branch.

### Crystallisation

When the stabilisation window closes, the pending branch's boards become fully live.
No schema changes required — `present_positions` rows already exist and already point
to live `real_piece_id` values. The engine updates the `branch_tree` record to clear
`inStabilizationPeriod`; the piece tables are unaffected.

---

## Lookup Patterns

| Query | SQL |
|---|---|
| Piece at known coordinate | `SELECT real_piece_id FROM present_positions WHERE game_id=? AND timeline=? AND turn=? AND region=? AND owner=? AND type=? AND disambiguator=?` — O(log n), primary key lookup |
| All pieces in a region | `SELECT ... WHERE game_id=? AND timeline=? AND turn=? AND region=?` — idx_present_region |
| All pieces on a board | `SELECT ... WHERE game_id=? AND timeline=? AND turn=?` — idx_present_board |
| Where is piece X right now? | `SELECT ... FROM piece_locations WHERE game_id=? AND real_piece_id=?` — primary key |
| All pieces owned by player P on board | `SELECT ... FROM present_positions WHERE game_id=? AND timeline=? AND turn=? AND owner=?` — idx_present_board + filter |
| Historical state at (tl, T, region) | `SELECT ... FROM historical_snapshots WHERE game_id=? AND timeline=? AND turn=? AND region=?` — idx_snapshot_board |

---

## Concurrent Turn Submission (Simultaneous Turn-Order Mode)

For sequential turn order (default for all current plugins), one player acts at a time
and SQLite's single-writer model is exactly correct.

For simultaneous turn-order mode (planned for a future diplomacy plugin), players submit
actions concurrently. Approach:

- Enable WAL mode (`PRAGMA journal_mode=WAL`) to allow reads while a write is in progress.
- Each player's actions execute inside their own transaction, serialised by a server-side
  queue. Players do not block each other during action processing — submissions are queued
  and applied in order. Adjudication runs as a single transaction after all players submit.
- Per-player staging tables are an alternative for full isolation but are deferred until
  the diplomacy plugin is designed.

---

## Integration with Existing Types

The current `Entity` type in `packages/types/src/entities.ts` will be superseded.
Migration path:

- `Entity.id` → `RealPieceId`; coordinate is now a DB lookup, not a field on the entity
- `Entity.location` → removed; location is derived from `piece_locations` or
  `present_positions`
- `Entity.data` → `pieces.data` (JSON column)
- `Board.entities: Map<EntityId, Entity>` → replaced by queries against `present_positions`
  and `historical_snapshots` for that board's `(timeline, turn)`
- `WorldState` no longer holds an in-memory entity map; it holds the DB connection
- `ActionContext.board.entities` → a view struct populated by a board query at action
  processing time, not a persistent in-memory map

Plugin interfaces (`IActionValidator`, `IActionEvaluator`, etc.) receive a `BoardView`
(pre-fetched for the action's board) and a `db` handle for cross-board queries via
`ActionContext`.

---

## Storage Adapter Interface

The engine never calls SQL directly. All piece storage operations go through a
`PieceStore` interface, making the storage backend swappable without touching engine
logic. SQLite is the default implementation; a DynamoDB or other distributed-DB adapter
can be substituted for online/scaled deployments.

```typescript
interface TurnTransaction {
  savepoint(name: string): void
  rollbackTo(name: string): void
  commit(): void
}

interface PieceStore {
  getBoard(gameId: string, timeline: string, turn: number): Promise<BoardView>
  getHistoricalBoard(gameId: string, timeline: string, turn: number): Promise<HistoricalBoardView>
  getPieceLocation(gameId: string, realPieceId: string): Promise<SpacetimeCoord>
  getPieceState(gameId: string, realPieceId: string): Promise<PieceState>
  movePiece(gameId: string, realPieceId: string, newCoord: SpacetimeCoord): Promise<void>
  updatePieceData(gameId: string, realPieceId: string, data: Record<string, unknown>): Promise<void>
  advanceAllTimelines(gameId: string): Promise<void>
  createBranch(gameId: string, originCoord: SpacetimeCoord, travelerId: string, newTimelineId: string): Promise<void>
  beginTurn(gameId: string): TurnTransaction
}
```

### SQLite adapter
Implements `TurnTransaction` with native `BEGIN` / `SAVEPOINT` / `ROLLBACK TO` /
`COMMIT`. All writes within a turn are inside one outer transaction; each action gets
a named savepoint. Turn advance runs as a single batched transaction.

### DynamoDB adapter (future)
DynamoDB maps naturally to the schema:
- Partition key: `game_id`
- Sort key: composite `timeline#turn#region#owner#type#disambiguator`
- `piece_locations` becomes a Global Secondary Index

Differences to handle in the adapter:
- No SQL window functions — disambiguator compaction is application-level logic
- DynamoDB transactions cap at 100 items — turn advance for large boards must batch
- No native savepoints — `TurnTransaction` maintains an in-memory undo stack
  (Immer or equivalent) and flushes to DynamoDB only on `commit()`

Per-game SQLite files are the default for development and self-hosted deployments.
Migration to DynamoDB for a scaled online deployment requires only a new adapter
implementation; the engine and plugin code are unchanged.

---

## Open Questions

1. **Snapshot granularity for mid-turn display**: snapshots are written at turn boundaries.
   If the client needs to display the state of a historical board mid-turn (e.g. for
   animated replay), it reconstructs it from the turn-start snapshot plus the action log.
   A separate action log table may be needed for this.

2. **Per-game DB file vs. shared DB**: each game could use its own SQLite file (zero
   contention, easy cleanup) or all games share one file with `game_id` as a partition
   key (simpler connection management). Per-game files are the default; shared file is
   an option if connection overhead becomes measurable.
