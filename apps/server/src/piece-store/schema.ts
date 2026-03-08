/**
 * SQL DDL for a per-game piece store SQLite database.
 * No game_id column — each game uses its own file (or its own in-memory DB).
 */
export const PIECE_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS pieces (
  game_id       TEXT NOT NULL,
  real_piece_id TEXT NOT NULL,
  owner         TEXT NOT NULL,
  type          TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (game_id, real_piece_id)
);

CREATE TABLE IF NOT EXISTS present_positions (
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

CREATE TABLE IF NOT EXISTS historical_snapshots (
  game_id       TEXT    NOT NULL,
  timeline      TEXT    NOT NULL,
  turn          INTEGER NOT NULL,
  region        TEXT    NOT NULL,
  owner         TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  disambiguator INTEGER NOT NULL DEFAULT 0,
  data          TEXT    NOT NULL DEFAULT '{}',
  PRIMARY KEY (game_id, timeline, turn, region, owner, type, disambiguator)
);

CREATE TABLE IF NOT EXISTS piece_locations (
  game_id       TEXT    NOT NULL,
  real_piece_id TEXT    NOT NULL,
  timeline      TEXT    NOT NULL,
  turn          INTEGER NOT NULL,
  region        TEXT    NOT NULL,
  disambiguator INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, real_piece_id)
);

CREATE INDEX IF NOT EXISTS idx_present_board
  ON present_positions(game_id, timeline, turn);

CREATE INDEX IF NOT EXISTS idx_present_region
  ON present_positions(game_id, timeline, turn, region);

CREATE INDEX IF NOT EXISTS idx_snapshot_board
  ON historical_snapshots(game_id, timeline, turn);
`;
