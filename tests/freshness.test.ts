import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { computeFreshness } from "../src/lib/freshness";
import { loadSupplySnapshots } from "../src/lib/supply";

const DATA_DIR = path.join(process.cwd(), "data");

test("freshness reads observation dates from the real dataset content", () => {
  const groups = computeFreshness(DATA_DIR, "2026-08-17");
  const byKey = new Map(groups.map((group) => [group.key, group]));

  // Radar files carry fetched_at = 2026-08-16/17 in the committed dataset.
  const radar = byKey.get("radar");
  assert.ok(radar);
  assert.ok(radar.newestDay !== null);
  assert.ok(radar.ageDays !== null && radar.ageDays <= 2, "radar must read fetched_at, not be unknown");
  assert.equal(radar.status, "fresh");

  // Supply snapshots end at 2026-08-17 (filename-dated).
  const supply = byKey.get("supply");
  assert.equal(supply?.newestDay, "2026-08-17");
  assert.equal(supply?.status, "fresh");

  // Revenue newest file is past-revenue-2026-08-13.
  const revenue = byKey.get("revenue");
  assert.equal(revenue?.newestDay, "2026-08-13");

  assert.equal(groups.length, 5, "all five groups reported");
});

test("freshness statuses degrade with a far-future today", () => {
  const groups = computeFreshness(DATA_DIR, "2026-12-01");
  for (const group of groups) {
    assert.ok(
      group.status === "stale" || group.status === "unknown",
      `${group.key} must be stale months later, got ${group.status}`,
    );
  }
});

test("freshness handles a missing data dir without throwing", () => {
  const groups = computeFreshness("/nonexistent-dir", "2026-08-17");
  assert.equal(groups.length, 5);
  for (const group of groups) assert.equal(group.status, "unknown");
});

test("supply loader reports issues for malformed files instead of throwing", () => {
  const { snapshots, issues } = loadSupplySnapshots(DATA_DIR);
  assert.equal(snapshots.length, 12, "all 12 committed snapshots parse");
  assert.equal(issues.length, 0);
  assert.equal(snapshots[0].date, "2026-08-01");
  assert.equal(snapshots[snapshots.length - 1].date, "2026-08-17");
  assert.ok(snapshots[0].roomIds.length > 400);
});
