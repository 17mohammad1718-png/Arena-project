import type Database from "better-sqlite3";

/**
 * Phase 3 (N1): host-owned market-intelligence records — named competitor
 * sets, per-competitor notes/labels and the alert dedup log.
 */

/* ------------------------------ competitor sets --------------------------- */

export interface CompetitorSet {
  id: number;
  name: string;
  roomIds: number[];
  createdAt: string;
}

export function listSets(db: Database.Database): CompetitorSet[] {
  const sets = db
    .prepare("SELECT id, name, created_at FROM competitor_sets ORDER BY id")
    .all() as { id: number; name: string; created_at: string }[];
  const members = db
    .prepare("SELECT set_id, room_id FROM competitor_set_rooms")
    .all() as { set_id: number; room_id: number }[];

  const byId = new Map<number, number[]>();
  for (const row of members) {
    const list = byId.get(row.set_id) ?? [];
    list.push(row.room_id);
    byId.set(row.set_id, list);
  }
  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    roomIds: byId.get(set.id) ?? [],
    createdAt: set.created_at,
  }));
}

export function getSet(db: Database.Database, id: number): CompetitorSet | null {
  return listSets(db).find((set) => set.id === id) ?? null;
}

export function createSet(
  db: Database.Database,
  name: string,
  roomIds: number[],
): CompetitorSet {
  const insert = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO competitor_sets (name) VALUES (?)")
      .run(name.trim());
    const setId = Number(info.lastInsertRowid);
    const add = db.prepare(
      "INSERT OR IGNORE INTO competitor_set_rooms (set_id, room_id) VALUES (?, ?)",
    );
    for (const roomId of roomIds) add.run(setId, roomId);
    return setId;
  });
  const setId = insert();
  return getSet(db, setId) as CompetitorSet;
}

export function updateSetRooms(
  db: Database.Database,
  setId: number,
  roomIds: number[],
): boolean {
  const exists = db.prepare("SELECT id FROM competitor_sets WHERE id = ?").get(setId);
  if (!exists) return false;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM competitor_set_rooms WHERE set_id = ?").run(setId);
    const add = db.prepare(
      "INSERT OR IGNORE INTO competitor_set_rooms (set_id, room_id) VALUES (?, ?)",
    );
    for (const roomId of roomIds) add.run(setId, roomId);
  });
  tx();
  return true;
}

export function deleteSet(db: Database.Database, setId: number): boolean {
  // ON DELETE CASCADE needs foreign_keys pragma; delete members explicitly to
  // stay independent of connection settings.
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM competitor_set_rooms WHERE set_id = ?").run(setId);
    return db.prepare("DELETE FROM competitor_sets WHERE id = ?").run(setId).changes > 0;
  });
  return tx();
}

/* ------------------------------ competitor notes --------------------------- */

export const NOTE_LABELS = ["watch", "neighbor", "benchmark"] as const;
export type NoteLabel = (typeof NOTE_LABELS)[number];

export const NOTE_LABEL_FA: Record<NoteLabel, string> = {
  watch: "زیر نظر",
  neighbor: "همسایه",
  benchmark: "مرجع مقایسه",
};

export interface CompetitorNote {
  roomId: number;
  note: string;
  label: NoteLabel | null;
  updatedAt: string;
}

export function getNotes(db: Database.Database): Map<number, CompetitorNote> {
  const rows = db
    .prepare("SELECT room_id, note, label, updated_at FROM competitor_notes")
    .all() as { room_id: number; note: string; label: string | null; updated_at: string }[];
  return new Map(
    rows.map((row) => [
      row.room_id,
      {
        roomId: row.room_id,
        note: row.note,
        label: (NOTE_LABELS as readonly string[]).includes(row.label ?? "")
          ? (row.label as NoteLabel)
          : null,
        updatedAt: row.updated_at,
      },
    ]),
  );
}

export function upsertNote(
  db: Database.Database,
  roomId: number,
  note: string,
  label: NoteLabel | null,
): CompetitorNote {
  db.prepare(
    `INSERT INTO competitor_notes (room_id, note, label, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(room_id) DO UPDATE SET note = excluded.note, label = excluded.label,
       updated_at = datetime('now')`,
  ).run(roomId, note, label);
  return getNotes(db).get(roomId) as CompetitorNote;
}

export function deleteNote(db: Database.Database, roomId: number): boolean {
  return db.prepare("DELETE FROM competitor_notes WHERE room_id = ?").run(roomId).changes > 0;
}

/* --------------------------------- alert log ------------------------------- */

export interface AlertRecord {
  id: number;
  ruleKey: string;
  firedOn: string;
  payload: Record<string, unknown>;
  dismissed: boolean;
}

/** Record an alert once per rule per day. Returns false when already logged. */
export function logAlert(
  db: Database.Database,
  ruleKey: string,
  firedOn: string,
  payload: Record<string, unknown> = {},
): boolean {
  const info = db
    .prepare(
      "INSERT OR IGNORE INTO alert_log (rule_key, fired_on, payload) VALUES (?, ?, ?)",
    )
    .run(ruleKey, firedOn, JSON.stringify(payload));
  return info.changes > 0;
}

export function listAlerts(db: Database.Database, firedOn?: string): AlertRecord[] {
  const rows = (
    firedOn
      ? db.prepare("SELECT * FROM alert_log WHERE fired_on = ? ORDER BY id").all(firedOn)
      : db.prepare("SELECT * FROM alert_log ORDER BY fired_on DESC, id").all()
  ) as { id: number; rule_key: string; fired_on: string; payload: string; dismissed: number }[];
  return rows.map((row) => ({
    id: row.id,
    ruleKey: row.rule_key,
    firedOn: row.fired_on,
    payload: safeParse(row.payload),
    dismissed: row.dismissed === 1,
  }));
}

export function dismissAlert(db: Database.Database, id: number): boolean {
  return db.prepare("UPDATE alert_log SET dismissed = 1 WHERE id = ?").run(id).changes > 0;
}

function safeParse(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
