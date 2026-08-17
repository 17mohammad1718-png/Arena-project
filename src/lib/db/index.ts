import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

/**
 * Host-owned data lives in a local SQLite database under `var/`, strictly
 * separated from the read-only market dataset in `data/` (which belongs to
 * the Hermes pipeline). See docs/phase-2-plan.md.
 */

const VAR_DIR = path.join(process.cwd(), "var");
const DB_PATH = process.env.MIZBANYAR_DB ?? path.join(VAR_DIR, "mizbanyar.db");

const MIGRATIONS: string[] = [
  // 001 — initial host-data schema
  `
  CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL,             -- ISO Gregorian YYYY-MM-DD
    amount       INTEGER NOT NULL,          -- toman
    category     TEXT NOT NULL DEFAULT 'misc',
    note         TEXT NOT NULL DEFAULT '',
    recurring_id INTEGER,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

  CREATE TABLE IF NOT EXISTS recurrings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    amount       INTEGER NOT NULL,
    category     TEXT NOT NULL DEFAULT 'misc',
    day_of_month INTEGER NOT NULL DEFAULT 1, -- Jalali day the cost occurs
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    check_in        TEXT NOT NULL,           -- ISO, first night
    check_out       TEXT NOT NULL,           -- ISO, exclusive
    guests          INTEGER,
    gross_amount    INTEGER NOT NULL,        -- toman, before discount
    discount_amount INTEGER NOT NULL DEFAULT 0,
    source          TEXT NOT NULL DEFAULT 'manual',   -- manual | import
    status          TEXT NOT NULL DEFAULT 'confirmed',-- confirmed | cancelled
    note            TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reservations_range ON reservations(check_in, check_out);

  CREATE TABLE IF NOT EXISTS blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL UNIQUE,         -- ISO
    reason     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS archive_realized (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT NOT NULL,
    range_start TEXT NOT NULL,
    range_end   TEXT NOT NULL,
    room_id     INTEGER NOT NULL,
    payload     TEXT NOT NULL,               -- JSON snapshot of the room row
    UNIQUE(range_start, range_end, room_id)
  );

  CREATE TABLE IF NOT EXISTS archive_prices (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at    TEXT NOT NULL,            -- capture day (ISO)
    date           TEXT NOT NULL,            -- the night the price is for
    room_id        INTEGER NOT NULL,
    price          INTEGER,
    is_unavailable INTEGER NOT NULL DEFAULT 0,
    UNIQUE(captured_at, date, room_id)
  );
  CREATE INDEX IF NOT EXISTS idx_archive_prices_room ON archive_prices(room_id, date);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

let db: Database.Database | null = null;

function migrate(conn: Database.Database) {
  conn.pragma("journal_mode = WAL");
  conn.exec("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)");
  const done = new Set(
    (conn.prepare("SELECT version FROM _migrations").all() as { version: number }[]).map(
      (row) => row.version,
    ),
  );
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (done.has(version)) return;
    const run = conn.transaction(() => {
      conn.exec(sql);
      conn.prepare("INSERT INTO _migrations (version) VALUES (?)").run(version);
    });
    run();
  });
}

/**
 * One-time import of the pipeline's manual-blocks.json into the blocks table,
 * so the host stops needing a terminal for day-to-day blocking. The JSON file
 * stays untouched (it belongs to the pipeline).
 */
function seedBlocksFromManualJson(conn: Database.Database, ownerRoomId: number) {
  const marker = conn
    .prepare("SELECT value FROM meta WHERE key = 'manual_blocks_imported'")
    .get() as { value: string } | undefined;
  if (marker) return;

  const file = path.join(process.cwd(), "data", "manual-blocks.json");
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const dates = Array.isArray(raw[String(ownerRoomId)])
        ? (raw[String(ownerRoomId)] as string[])
        : [];
      const insert = conn.prepare(
        "INSERT OR IGNORE INTO blocks (date, reason) VALUES (?, 'وارد شده از manual-blocks.json')",
      );
      const tx = conn.transaction((list: string[]) => {
        for (const date of list) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) insert.run(date);
        }
      });
      tx(dates);
    } catch {
      // A malformed pipeline file must not brick the host database.
    }
  }
  conn
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('manual_blocks_imported', ?)")
    .run(new Date().toISOString());
}

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  migrate(db);
  seedBlocksFromManualJson(db, 3297585);
  return db;
}

/** Open an isolated in-memory database — used by tests. */
export function openTestDb(): Database.Database {
  const conn = new Database(":memory:");
  migrate(conn);
  return conn;
}
