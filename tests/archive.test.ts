import assert from "node:assert/strict";
import test from "node:test";

import { openTestDb } from "../src/lib/db";
import {
  archiveRadarPrices,
  archiveRealized,
  countPriceCaptures,
  listRealizedCaptures,
} from "../src/lib/db/archive";

const OWNER = 3297585;

test("archiving realized rooms is idempotent per window+room", () => {
  const db = openTestDb();
  const rooms = [
    { rangeStart: "2026-08-07", rangeEnd: "2026-08-12", roomId: OWNER, payload: { net: 10_000_000 } },
    { rangeStart: "2026-08-07", rangeEnd: "2026-08-12", roomId: 111, payload: { net: 5_000_000 } },
  ];

  assert.equal(archiveRealized(db, rooms), 2);
  assert.equal(archiveRealized(db, rooms), 0, "second run must add nothing");

  const captures = listRealizedCaptures(db, OWNER);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].rooms, 2);
  assert.equal(captures[0].totalNet, 15_000_000);
  assert.equal(captures[0].ownerNet, 10_000_000);
});

test("two different windows produce a two-point trend, oldest first", () => {
  const db = openTestDb();
  archiveRealized(db, [
    { rangeStart: "2026-09-01", rangeEnd: "2026-09-06", roomId: OWNER, payload: { net: 12_000_000 } },
  ]);
  archiveRealized(db, [
    { rangeStart: "2026-08-07", rangeEnd: "2026-08-12", roomId: OWNER, payload: { net: 10_000_000 } },
  ]);

  const captures = listRealizedCaptures(db, OWNER);
  assert.equal(captures.length, 2);
  assert.equal(captures[0].rangeStart, "2026-08-07");
  assert.equal(captures[1].rangeStart, "2026-09-01");
});

test("radar price archiving dedupes on capture day + night + room", () => {
  const db = openTestDb();
  const nights = [
    { capturedAt: "2026-08-17", date: "2026-09-01", roomId: 1, price: 2_000_000, isUnavailable: false },
    { capturedAt: "2026-08-17", date: "2026-09-02", roomId: 1, price: null, isUnavailable: true },
  ];
  assert.equal(archiveRadarPrices(db, nights), 2);
  assert.equal(archiveRadarPrices(db, nights), 0);

  // A later capture of the same nights is a NEW observation and must be kept.
  const later = nights.map((night) => ({ ...night, capturedAt: "2026-08-24" }));
  assert.equal(archiveRadarPrices(db, later), 2);
  assert.equal(countPriceCaptures(db), 2);
});

test("malformed payloads are skipped without breaking the trend", () => {
  const db = openTestDb();
  archiveRealized(db, [
    { rangeStart: "2026-08-07", rangeEnd: "2026-08-12", roomId: 1, payload: { net: 1_000_000 } },
  ]);
  // Corrupt the stored payload directly.
  db.prepare("UPDATE archive_realized SET payload = 'not-json' WHERE room_id = 1").run();

  const captures = listRealizedCaptures(db, OWNER);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].totalNet, 0);
});
