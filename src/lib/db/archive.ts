import type Database from "better-sqlite3";

/**
 * History accumulation (plan M5): every pipeline refresh overwrites the files
 * in `data/`, losing the previous observation. Archiving copies the current
 * realized-revenue slice and the radar asking prices into SQLite with a
 * capture stamp, so trends can be built once two or more captures exist.
 * All writes are idempotent via UNIQUE constraints.
 */

export interface RealizedRoomSnapshot {
  rangeStart: string;
  rangeEnd: string;
  roomId: number;
  payload: Record<string, unknown>;
}

export interface RadarNightSnapshot {
  capturedAt: string;
  date: string;
  roomId: number;
  price: number | null;
  isUnavailable: boolean;
}

export function archiveRealized(
  db: Database.Database,
  rooms: RealizedRoomSnapshot[],
): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO archive_realized (captured_at, range_start, range_end, room_id, payload)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  let added = 0;
  const tx = db.transaction((list: RealizedRoomSnapshot[]) => {
    for (const room of list) {
      const info = insert.run(
        now,
        room.rangeStart,
        room.rangeEnd,
        room.roomId,
        JSON.stringify(room.payload),
      );
      added += info.changes;
    }
  });
  tx(rooms);
  return added;
}

export function archiveRadarPrices(
  db: Database.Database,
  nights: RadarNightSnapshot[],
): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO archive_prices (captured_at, date, room_id, price, is_unavailable)
     VALUES (?, ?, ?, ?, ?)`,
  );
  let added = 0;
  const tx = db.transaction((list: RadarNightSnapshot[]) => {
    for (const night of list) {
      const info = insert.run(
        night.capturedAt,
        night.date,
        night.roomId,
        night.price,
        night.isUnavailable ? 1 : 0,
      );
      added += info.changes;
    }
  });
  tx(nights);
  return added;
}

export interface RealizedCapture {
  rangeStart: string;
  rangeEnd: string;
  capturedAt: string;
  rooms: number;
  /** Summed over archived room payloads that carry a `net` field. */
  totalNet: number;
  ownerNet: number | null;
}

/** Distinct realized windows, oldest first — the revenue trend's data source. */
export function listRealizedCaptures(
  db: Database.Database,
  ownerRoomId: number,
): RealizedCapture[] {
  const rows = db
    .prepare(
      `SELECT range_start, range_end, MIN(captured_at) AS captured_at,
              COUNT(*) AS rooms
       FROM archive_realized
       GROUP BY range_start, range_end
       ORDER BY range_start`,
    )
    .all() as { range_start: string; range_end: string; captured_at: string; rooms: number }[];

  return rows.map((row) => {
    const payloads = db
      .prepare(
        "SELECT room_id, payload FROM archive_realized WHERE range_start = ? AND range_end = ?",
      )
      .all(row.range_start, row.range_end) as { room_id: number; payload: string }[];

    let totalNet = 0;
    let ownerNet: number | null = null;
    for (const entry of payloads) {
      try {
        const parsed = JSON.parse(entry.payload) as { net?: unknown };
        const net = typeof parsed.net === "number" ? parsed.net : 0;
        totalNet += net;
        if (entry.room_id === ownerRoomId) ownerNet = net;
      } catch {
        // Skip malformed payloads rather than break the trend.
      }
    }

    return {
      rangeStart: row.range_start,
      rangeEnd: row.range_end,
      capturedAt: row.captured_at,
      rooms: row.rooms,
      totalNet,
      ownerNet,
    };
  });
}

/** Number of distinct radar capture days stored, per room or overall. */
export function countPriceCaptures(db: Database.Database): number {
  const row = db
    .prepare("SELECT COUNT(DISTINCT captured_at) AS captures FROM archive_prices")
    .get() as { captures: number };
  return row.captures;
}
