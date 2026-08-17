import assert from "node:assert/strict";
import test from "node:test";

import {
  computeOccupancyTrend,
  computePriceChanges,
  foldRoomCaptures,
} from "../src/lib/market-trends";
import { computeSupplyTrend } from "../src/lib/supply";
import type { SupplySnapshot } from "../src/lib/supply";

/* ------------------------------ price history ----------------------------- */

function row(
  capturedAt: string,
  roomId: number,
  date: string,
  price: number | null,
  unavailable = false,
) {
  return { captured_at: capturedAt, date, room_id: roomId, price, is_unavailable: unavailable ? 1 : 0 };
}

test("foldRoomCaptures: medians open nights only, tracks occupancy per capture", () => {
  const points = foldRoomCaptures([
    row("2026-08-17", 1, "2026-09-01", 2_000_000),
    row("2026-08-17", 1, "2026-09-02", 3_000_000),
    row("2026-08-17", 1, "2026-09-03", 9_000_000, true), // sold: stale price excluded
    row("2026-08-24", 1, "2026-09-01", 2_500_000),
  ]);

  assert.equal(points.length, 2);
  assert.equal(points[0].capturedAt, "2026-08-17");
  assert.equal(points[0].medianPrice, 2_500_000); // (2M+3M)/2
  assert.equal(points[0].nights, 3);
  assert.ok(Math.abs(points[0].occupancy - 1 / 3) < 1e-9);
  assert.equal(points[1].medianPrice, 2_500_000);
});

test("computePriceChanges: compares the two latest captures, sorted by magnitude", () => {
  const rows = [
    // room 1: 2.0M -> 2.4M (+20%)
    row("2026-08-17", 1, "2026-09-01", 2_000_000),
    row("2026-08-24", 1, "2026-09-01", 2_400_000),
    // room 2: 3.0M -> 2.85M (−5%)
    row("2026-08-17", 2, "2026-09-01", 3_000_000),
    row("2026-08-24", 2, "2026-09-01", 2_850_000),
    // room 3: only in the new capture — no change reported
    row("2026-08-24", 3, "2026-09-01", 5_000_000),
    // an older capture that must be ignored (only last two count)
    row("2026-08-10", 1, "2026-09-01", 1_000_000),
  ];

  const changes = computePriceChanges(rows);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].roomId, 1);
  assert.ok(Math.abs(changes[0].changePercent - 0.2) < 1e-9);
  assert.equal(changes[0].fromCapture, "2026-08-17");
  assert.equal(changes[1].roomId, 2);
  assert.ok(changes[1].changePercent < 0);
});

test("computePriceChanges: fewer than two captures yields nothing", () => {
  assert.deepEqual(computePriceChanges([row("2026-08-17", 1, "2026-09-01", 2_000_000)]), []);
});

test("occupancy trend averages per-room shares and can exclude the owner", () => {
  const rows = [
    // capture 1: room 1 fully open, room 2 fully taken -> avg 50%
    row("2026-08-17", 1, "2026-09-01", 2_000_000),
    row("2026-08-17", 2, "2026-09-01", null, true),
    // owner room 99 must be excluded
    row("2026-08-17", 99, "2026-09-01", null, true),
    // capture 2: both taken -> avg 100%
    row("2026-08-24", 1, "2026-09-01", null, true),
    row("2026-08-24", 2, "2026-09-01", null, true),
  ];

  const trend = computeOccupancyTrend(rows, 99);
  assert.equal(trend.length, 2);
  assert.equal(trend[0].rooms, 2);
  assert.equal(trend[0].avgOccupancy, 0.5);
  assert.equal(trend[1].avgOccupancy, 1);
});

/* ------------------------------- supply trend ------------------------------ */

function snapshot(date: string, babolkenar: number, cottages: number, ids: number[]): SupplySnapshot {
  return { date, babolkenarListings: babolkenar, cottageListings: cottages, roomIds: ids };
}

test("supply trend: deltas and entrant/exit detection across the window", () => {
  const trend = computeSupplyTrend([
    snapshot("2026-08-01", 508, 368, [1, 2, 3]),
    snapshot("2026-08-10", 511, 373, [1, 2, 4]),
    snapshot("2026-08-17", 509, 373, [1, 4, 5]),
  ]);

  assert.equal(trend.points.length, 3);
  assert.equal(trend.babolkenarDelta, 1); // 509 − 508
  assert.equal(trend.cottageDelta, 5);
  assert.deepEqual(trend.newRoomIds.sort(), [4, 5]); // in last, not in first
  assert.deepEqual(trend.goneRoomIds.sort(), [2, 3]); // in first, gone in last
});

test("supply trend: empty input stays safe", () => {
  const trend = computeSupplyTrend([]);
  assert.equal(trend.points.length, 0);
  assert.equal(trend.first, null);
  assert.equal(trend.babolkenarDelta, 0);
  assert.deepEqual(trend.newRoomIds, []);
});
