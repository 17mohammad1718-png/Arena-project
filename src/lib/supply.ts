import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Phase 3 (N3): supply trend from the daily snapshots in data/snapshots/ —
 * previously collected by the pipeline but never used by the app. Parsing is
 * separated from the pure trend math so tests can feed fixtures.
 */

export interface SupplySnapshot {
  date: string;
  babolkenarListings: number;
  cottageListings: number;
  roomIds: number[];
}

export interface SupplyIssue {
  file: string;
  message: string;
}

export function loadSupplySnapshots(dataDir: string): {
  snapshots: SupplySnapshot[];
  issues: SupplyIssue[];
} {
  const dir = path.join(dataDir, "snapshots");
  const snapshots: SupplySnapshot[] = [];
  const issues: SupplyIssue[] = [];

  if (!existsSync(dir)) return { snapshots, issues: [{ file: "snapshots/", message: "پوشه یافت نشد" }] };

  for (const file of readdirSync(dir).sort()) {
    if (!/^supply-\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        date?: string;
        meta_counts?: { babolkenar?: number; cottage?: number };
        room_ids?: unknown[];
      };
      if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        issues.push({ file: `snapshots/${file}`, message: "فیلد date نامعتبر" });
        continue;
      }
      snapshots.push({
        date: raw.date,
        babolkenarListings: raw.meta_counts?.babolkenar ?? 0,
        cottageListings: raw.meta_counts?.cottage ?? 0,
        roomIds: Array.isArray(raw.room_ids)
          ? raw.room_ids.filter((id): id is number => typeof id === "number")
          : [],
      });
    } catch (error) {
      issues.push({
        file: `snapshots/${file}`,
        message: (error as Error).message.slice(0, 120),
      });
    }
  }

  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  return { snapshots, issues };
}

/* --------------------------------- trends ---------------------------------- */

export interface SupplyTrend {
  points: { date: string; babolkenar: number; cottages: number; tracked: number }[];
  first: SupplySnapshot | null;
  last: SupplySnapshot | null;
  /** Net change over the whole window. */
  babolkenarDelta: number;
  cottageDelta: number;
  /** Rooms present in the last snapshot but not the first (new entrants). */
  newRoomIds: number[];
  /** Rooms present in the first snapshot but gone in the last. */
  goneRoomIds: number[];
}

/** Pure: fold snapshots into a chart-ready trend plus entrant/exit sets. */
export function computeSupplyTrend(snapshots: SupplySnapshot[]): SupplyTrend {
  const first = snapshots[0] ?? null;
  const last = snapshots[snapshots.length - 1] ?? null;

  const firstIds = new Set(first?.roomIds ?? []);
  const lastIds = new Set(last?.roomIds ?? []);

  return {
    points: snapshots.map((snapshot) => ({
      date: snapshot.date,
      babolkenar: snapshot.babolkenarListings,
      cottages: snapshot.cottageListings,
      tracked: snapshot.roomIds.length,
    })),
    first,
    last,
    babolkenarDelta:
      first && last ? last.babolkenarListings - first.babolkenarListings : 0,
    cottageDelta: first && last ? last.cottageListings - first.cottageListings : 0,
    newRoomIds: last ? last.roomIds.filter((id) => !firstIds.has(id)) : [],
    goneRoomIds: first ? first.roomIds.filter((id) => !lastIds.has(id)) : [],
  };
}
