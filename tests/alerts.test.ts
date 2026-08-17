import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAlerts,
  competitorPriceMoveRule,
  marketHeatRule,
  newSupplyRule,
  occupancyBehindRule,
  weekendUnderpricedRule,
} from "../src/lib/alerts";
import type { CalendarDay } from "../src/lib/jajiga/pricing";
import type { SupplyTrend } from "../src/lib/supply";

const TODAY = "2026-08-17";

function day(overrides: Partial<CalendarDay>): CalendarDay {
  return {
    date: "2026-08-20",
    jalaliDay: 1,
    weekday: 4,
    isWeekend: true,
    holiday: null,
    season: "high",
    state: "open",
    price: 3_000_000,
    effectivePrice: 3_000_000,
    discountPercent: 0,
    market: 3_500_000,
    suggestedMin: 3_400_000,
    suggestedMax: 3_900_000,
    suggestedCenter: 3_650_000,
    samples: 10,
    marketOccupancy: 0.4,
    gap: null,
    verdict: "underpriced",
    isPast: false,
    isTracked: true,
    ...overrides,
  };
}

function emptySupply(): SupplyTrend {
  return {
    points: [],
    first: null,
    last: null,
    babolkenarDelta: 0,
    cottageDelta: 0,
    newRoomIds: [],
    goneRoomIds: [],
  };
}

/* --------------------------------- rules ---------------------------------- */

test("weekend-underpriced fires only for open weekend nights within 14 days", () => {
  const alert = weekendUnderpricedRule(
    [
      day({ date: "2026-08-20" }), // fires
      day({ date: "2026-08-21", state: "booked" }), // booked: no decision
      day({ date: "2026-08-19", isWeekend: false }), // weekday
      day({ date: "2026-09-15" }), // beyond horizon
      day({ date: "2026-08-27", suggestedMin: null }), // no market data
    ],
    TODAY,
  );

  assert.ok(alert);
  assert.equal(alert.ruleKey, "weekend-underpriced");
  assert.deepEqual(alert.payload.nights, ["2026-08-20"]);
  assert.equal(alert.payload.uplift, 400_000);
});

test("weekend-underpriced stays silent when nights are fairly priced", () => {
  assert.equal(
    weekendUnderpricedRule([day({ effectivePrice: 3_500_000 })], TODAY),
    null,
  );
});

test("occupancy-behind needs a real gap, enough peers and non-trivial market", () => {
  assert.ok(occupancyBehindRule(0.1, 0.35, 20));
  assert.equal(occupancyBehindRule(0.3, 0.35, 20), null, "small gap");
  assert.equal(occupancyBehindRule(0.1, 0.35, 3), null, "too few peers");
  assert.equal(occupancyBehindRule(0.0, 0.04, 20), null, "dead market");
  assert.equal(occupancyBehindRule(null, 0.35, 20), null);
});

test("competitor-price-move reports the biggest mover with its title", () => {
  const alert = competitorPriceMoveRule(
    [
      {
        roomId: 7,
        fromCapture: "2026-08-10",
        toCapture: "2026-08-17",
        fromMedian: 2_000_000,
        toMedian: 2_400_000,
        changePercent: 0.2,
      },
      {
        roomId: 8,
        fromCapture: "2026-08-10",
        toCapture: "2026-08-17",
        fromMedian: 3_000_000,
        toMedian: 3_060_000,
        changePercent: 0.02, // below threshold
      },
    ],
    new Map([[7, "کلبه سوئیسی سیدمهدی"]]),
  );

  assert.ok(alert);
  assert.ok(alert.title.includes("۱"));
  assert.ok(alert.detail.includes("کلبه سوئیسی سیدمهدی"));
  assert.equal(alert.href, "/competitors/7");
});

test("new-supply respects the minimum threshold", () => {
  const trend: SupplyTrend = {
    ...emptySupply(),
    first: { date: "2026-08-01", babolkenarListings: 508, cottageListings: 368, roomIds: [] },
    last: { date: "2026-08-17", babolkenarListings: 509, cottageListings: 373, roomIds: [] },
    newRoomIds: [1, 2],
    goneRoomIds: [],
  };
  assert.equal(newSupplyRule(trend), null, "2 < default threshold 3");
  assert.ok(newSupplyRule({ ...trend, newRoomIds: [1, 2, 3] }));
});

test("market-heating fires on a sharp occupancy jump between captures", () => {
  assert.equal(
    marketHeatRule([{ capturedAt: "a", avgOccupancy: 0.3 }]),
    null,
    "one capture is not a trend",
  );
  assert.equal(
    marketHeatRule([
      { capturedAt: "a", avgOccupancy: 0.3 },
      { capturedAt: "b", avgOccupancy: 0.33 },
    ]),
    null,
    "small delta",
  );
  const alert = marketHeatRule([
    { capturedAt: "a", avgOccupancy: 0.3 },
    { capturedAt: "b", avgOccupancy: 0.45 },
  ]);
  assert.ok(alert);
  assert.equal(alert.ruleKey, "market-heating");
});

/* -------------------------------- assembly -------------------------------- */

test("buildAlerts sorts warnings before infos", () => {
  const alerts = buildAlerts({
    today: TODAY,
    calendarDays: [day({})], // warning
    ownerOccupancy: null,
    peerMedianOccupancy: null,
    peerCount: 0,
    priceChanges: [
      {
        roomId: 7,
        fromCapture: "a",
        toCapture: "b",
        fromMedian: 2_000_000,
        toMedian: 2_400_000,
        changePercent: 0.2,
      },
    ], // info
    competitorTitles: new Map(),
    supplyTrend: emptySupply(),
    occupancyTrend: [],
  });

  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].severity, "warning");
  assert.equal(alerts[1].severity, "info");
});
