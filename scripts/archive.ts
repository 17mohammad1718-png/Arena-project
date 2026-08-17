/**
 * `npm run archive` — copy the current pipeline outputs (realized revenue
 * slice + radar asking prices) into the local history tables. Run it once
 * after every dataset refresh; re-running is a safe no-op.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { getDb } from "../src/lib/db";
import {
  archiveRadarPrices,
  archiveRealized,
  countPriceCaptures,
  listRealizedCaptures,
} from "../src/lib/db/archive";
import type { RadarNightSnapshot, RealizedRoomSnapshot } from "../src/lib/db/archive";

const DATA = path.join(process.cwd(), "data");
const OWNER_ROOM_ID = 3297585;

const db = getDb();

/* ----------------------------- realized revenue ---------------------------- */

const realizedPath = path.join(DATA, "revenue", "realized-seydkola-mordad-1405.json");
let realizedAdded = 0;
if (existsSync(realizedPath)) {
  const raw = JSON.parse(readFileSync(realizedPath, "utf8")) as {
    realized_range?: string;
    rooms?: Record<string, unknown>[];
  };
  // realized_range is like "2026-08-07 تا 2026-08-12 ۱۴۰۵"
  const isoDates = (raw.realized_range ?? "").match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const [rangeStart, rangeEnd] = [isoDates[0], isoDates[1] ?? isoDates[0]];
  if (rangeStart && Array.isArray(raw.rooms)) {
    const rooms: RealizedRoomSnapshot[] = raw.rooms
      .map((room) => ({
        rangeStart,
        rangeEnd,
        roomId: Number((room as { id?: unknown }).id),
        payload: room,
      }))
      .filter((room) => Number.isFinite(room.roomId));
    realizedAdded = archiveRealized(db, rooms);
  }
}

/* ------------------------------- radar prices ------------------------------ */

const radarDir = path.join(DATA, "radar");
let priceAdded = 0;
if (existsSync(radarDir)) {
  const nights: RadarNightSnapshot[] = [];
  for (const file of readdirSync(radarDir)) {
    if (!/^\d+\.json$/.test(file)) continue;
    const raw = JSON.parse(readFileSync(path.join(radarDir, file), "utf8")) as {
      room_id?: number;
      fetched_at?: string;
      nights?: { date?: string; price?: number | null; is_unavailable?: boolean }[];
    };
    if (!raw.room_id || !Array.isArray(raw.nights)) continue;
    // Stamp with the pipeline's own fetch day so re-archiving the same files
    // stays idempotent even across machine days.
    const capturedAt = (raw.fetched_at ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    for (const night of raw.nights) {
      if (!night.date) continue;
      nights.push({
        capturedAt,
        date: night.date,
        roomId: raw.room_id,
        price: typeof night.price === "number" ? night.price : null,
        isUnavailable: night.is_unavailable === true,
      });
    }
  }
  priceAdded = archiveRadarPrices(db, nights);
}

/* ---------------------------------- report --------------------------------- */

const captures = listRealizedCaptures(db, OWNER_ROOM_ID);
console.log(`realized rows added: ${realizedAdded}`);
console.log(`radar price rows added: ${priceAdded}`);
console.log(`realized windows stored: ${captures.length}`);
console.log(`radar capture days stored: ${countPriceCaptures(db)}`);
for (const capture of captures) {
  console.log(
    `  ${capture.rangeStart} → ${capture.rangeEnd}: ${capture.rooms} rooms, total net ${capture.totalNet}` +
      (capture.ownerNet !== null ? `, owner net ${capture.ownerNet}` : ""),
  );
}
