import Database from 'better-sqlite3';

const DB_PATH = process.env['DB_PATH'] ?? './data.db';
const sqlite = new Database(DB_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    status TEXT NOT NULL,
    players TEXT NOT NULL,
    settings TEXT NOT NULL,
    world_state TEXT NOT NULL,
    branch_tree TEXT NOT NULL,
    execution_order TEXT NOT NULL,
    windows TEXT NOT NULL,
    winner TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    action TEXT NOT NULL,
    result TEXT NOT NULL,
    committed_at INTEGER NOT NULL
  );
`);

console.log('Database migrated successfully');
sqlite.close();
