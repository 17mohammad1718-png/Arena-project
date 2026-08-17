import type Database from "better-sqlite3";

/**
 * Phase 3 (N2/N3): market trends computed from the M5 archive tables and the
 * supply snapshots. Query helpers take the db connection; the math itself is
 * in pure functions that tests can call with fixture rows.
 */

/* ----------------------------- archive queries ---------------------------- */

interface PriceRow {
  captured_at: string;
  date: string;
  room_id: number;
  price: number | null;
  is_unavailable: number;
}

export interface RoomCapturePoint {
  capturedAt: string;
  nights: number;
  /** Median asking price across open nights in this capture; null if none. */
  medianPrice: number | null;
  /** Share of the captured window already unavailable. */
  occupancy: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Pure: fold raw archive rows into per-capture points for one room. */
export function foldRoomCaptures(rows: PriceRow[]): RoomCapturePoint[] {
  const byCapture = new Map<string, { open: number[]; taken: number; total: number }>();
  for (const row of rows) {
    const bucket = byCapture.get(row.captured_at) ?? { open: [], taken: 0, total: 0 };
    bucket.total += 1;
    if (row.is_unavailable === 1) bucket.taken += 1;
    else if (typeof row.price === "number" && row.price > 0) bucket.open.push(row.price);
    byCapture.set(row.captured_at, bucket);
  }
  return [...byCapture.entries()]
    .map(([capturedAt, bucket]) => ({
      capturedAt,
      nights: bucket.total,
      medianPrice: median(bucket.open),
      occupancy: bucket.total ? bucket.taken / bucket.total : 0,
    }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function roomPriceHistory(db: Database.Database, roomId: number): RoomCapturePoint[] {
  const rows = db
    .prepare(
      "SELECT captured_at, date, room_id, price, is_unavailable FROM archive_prices WHERE room_id = ?",
    )
    .all(roomId) as PriceRow[];
  return foldRoomCaptures(rows);
}

/* ----------------------------- price movements ---------------------------- */

export interface PriceChange {
  roomId: number;
  fromCapture: string;
  toCapture: string;
  fromMedian: number;
  toMedian: number;
  changePercent: number;
}

/**
 * Pure: compare the two most recent captures and report every room whose
 * median open-night price moved. Rooms missing a median in either capture are
 * skipped — absence of data is not a price change.
 */
export function computePriceChanges(rows: PriceRow[]): PriceChange[] {
  const captures = [...new Set(rows.map((row) => row.captured_at))].sort();
  if (captures.length < 2) return [];
  const [from, to] = captures.slice(-2);

  const byRoom = new Map<number, PriceRow[]>();
  for (const row of rows) {
    if (row.captured_at !== from && row.captured_at !== to) continue;
    const list = byRoom.get(row.room_id) ?? [];
    list.push(row);
    byRoom.set(row.room_id, list);
  }

  const changes: PriceChange[] = [];
  for (const [roomId, roomRows] of byRoom) {
    const points = foldRoomCaptures(roomRows);
    const fromPoint = points.find((p) => p.capturedAt === from);
    const toPoint = points.find((p) => p.capturedAt === to);
    if (!fromPoint?.medianPrice || !toPoint?.medianPrice) continue;
    changes.push({
      roomId,
      fromCapture: from,
      toCapture: to,
      fromMedian: fromPoint.medianPrice,
      toMedian: toPoint.medianPrice,
      changePercent: (toPoint.medianPrice - fromPoint.medianPrice) / fromPoint.medianPrice,
    });
  }
  return changes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

export function priceChangesBetweenCaptures(db: Database.Database): PriceChange[] {
  const rows = db
    .prepare("SELECT captured_at, date, room_id, price, is_unavailable FROM archive_prices")
    .all() as PriceRow[];
  return computePriceChanges(rows);
}

/* --------------------------- market occupancy trend ------------------------ */

export interface OccupancyTrendPoint {
  capturedAt: string;
  rooms: number;
  /** Average share of each room's captured window that is unavailable. */
  avgOccupancy: number;
}

/** Pure: per-capture market occupancy across rooms (owner excluded by caller). */
export function computeOccupancyTrend(rows: PriceRow[], excludeRoomId?: number): OccupancyTrendPoint[] {
  const byCapture = new Map<string, Map<number, { taken: number; total: number }>>();
  for (const row of rows) {
    if (excludeRoomId !== undefined && row.room_id === excludeRoomId) continue;
    const rooms = byCapture.get(row.captured_at) ?? new Map();
    const bucket = rooms.get(row.room_id) ?? { taken: 0, total: 0 };
    bucket.total += 1;
    if (row.is_unavailable === 1) bucket.taken += 1;
    rooms.set(row.room_id, bucket);
    byCapture.set(row.captured_at, rooms);
  }
  return [...byCapture.entries()]
    .map(([capturedAt, rooms]) => {
      const shares = [...rooms.values()]
        .filter((bucket) => bucket.total > 0)
        .map((bucket) => bucket.taken / bucket.total);
      return {
        capturedAt,
        rooms: shares.length,
        avgOccupancy: shares.length
          ? shares.reduce((sum, share) => sum + share, 0) / shares.length
          : 0,
      };
    })
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function marketOccupancyTrend(
  db: Database.Database,
  excludeRoomId?: number,
): OccupancyTrendPoint[] {
  const rows = db
    .prepare("SELECT captured_at, date, room_id, price, is_unavailable FROM archive_prices")
    .all() as PriceRow[];
  return computeOccupancyTrend(rows, excludeRoomId);
}
