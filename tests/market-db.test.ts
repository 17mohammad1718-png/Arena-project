import assert from "node:assert/strict";
import test from "node:test";

import { openTestDb } from "../src/lib/db";
import {
  createSet,
  deleteNote,
  deleteSet,
  dismissAlert,
  getNotes,
  getSet,
  listAlerts,
  listSets,
  logAlert,
  updateSetRooms,
  upsertNote,
} from "../src/lib/db/market";

/* ------------------------------ competitor sets --------------------------- */

test("sets: create, list with members, update rooms, delete", () => {
  const db = openTestDb();
  const set = createSet(db, "همسایه‌های سیدکلا", [101, 102, 103]);
  assert.equal(set.name, "همسایه‌های سیدکلا");
  assert.deepEqual([...set.roomIds].sort(), [101, 102, 103]);

  assert.ok(updateSetRooms(db, set.id, [101, 104]));
  assert.deepEqual([...(getSet(db, set.id)?.roomIds ?? [])].sort(), [101, 104]);

  assert.ok(!updateSetRooms(db, 999, [1]), "unknown set id must not update");

  assert.ok(deleteSet(db, set.id));
  assert.equal(listSets(db).length, 0);
  // Members must not survive the set.
  const orphans = db.prepare("SELECT COUNT(*) c FROM competitor_set_rooms").get() as { c: number };
  assert.equal(orphans.c, 0);
});

test("sets: duplicate names are rejected by the unique constraint", () => {
  const db = openTestDb();
  createSet(db, "استخردارها", [1]);
  assert.throws(() => createSet(db, "استخردارها", [2]));
});

/* --------------------------------- notes ---------------------------------- */

test("notes: upsert overwrites, label validated on read, delete works", () => {
  const db = openTestDb();
  upsertNote(db, 3293951, "مستقیم‌ترین رقیب", "watch");
  upsertNote(db, 3293951, "به‌روز شد", "neighbor");

  const note = getNotes(db).get(3293951);
  assert.equal(note?.note, "به‌روز شد");
  assert.equal(note?.label, "neighbor");

  // A stale/unknown label in the table is surfaced as null, not garbage.
  db.prepare("UPDATE competitor_notes SET label = 'bogus' WHERE room_id = ?").run(3293951);
  assert.equal(getNotes(db).get(3293951)?.label, null);

  assert.ok(deleteNote(db, 3293951));
  assert.equal(getNotes(db).size, 0);
});

/* -------------------------------- alert log -------------------------------- */

test("alerts: one per rule per day, dismiss persists", () => {
  const db = openTestDb();
  assert.ok(logAlert(db, "occupancy-behind", "2026-08-17", { gap: 0.2 }));
  assert.ok(!logAlert(db, "occupancy-behind", "2026-08-17"), "same day duplicate rejected");
  assert.ok(logAlert(db, "occupancy-behind", "2026-08-18"), "next day is a new alert");

  const today = listAlerts(db, "2026-08-17");
  assert.equal(today.length, 1);
  assert.equal(today[0].payload.gap, 0.2);

  assert.ok(dismissAlert(db, today[0].id));
  assert.equal(listAlerts(db, "2026-08-17")[0].dismissed, true);
});
