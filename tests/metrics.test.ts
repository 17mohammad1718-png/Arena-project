import assert from "node:assert/strict";
import test from "node:test";

import { toIsoDate } from "../src/lib/load-dataset";
import { normalizeDigits, parseCsv, toList, toNumber } from "../src/lib/csv";
import {
  addDays,
  diffDays,
  holidayName,
  isWeekendNight,
  jalaliMonthEnd,
  jalaliMonthStart,
  jalaliWeekday,
  nightsBetween,
  toJalali,
} from "../src/lib/dates";
import { buildDemoDataset } from "../src/lib/demo-data";
import {
  buildNightLedger,
  computeKpis,
  computeMarketPosition,
  computeMonthlySeries,
  median,
  percentileOf,
  quantile,
  scoreCompetitor,
} from "../src/lib/metrics";
import type { BlockedNight, Competitor, Property, Reservation } from "../src/lib/types";

/* -------------------------------------------------------------------------- */
/*                                    Dates                                   */
/* -------------------------------------------------------------------------- */

test("nightsBetween excludes the checkout night", () => {
  assert.deepEqual(nightsBetween("2025-08-17", "2025-08-20"), [
    "2025-08-17",
    "2025-08-18",
    "2025-08-19",
  ]);
  assert.deepEqual(nightsBetween("2025-08-17", "2025-08-17"), []);
});

test("jalali weekday indexes Saturday as 0", () => {
  // 2025-08-16 is a Saturday.
  assert.equal(jalaliWeekday("2025-08-16"), 0);
  assert.equal(jalaliWeekday("2025-08-17"), 1); // یکشنبه
  assert.equal(jalaliWeekday("2025-08-22"), 6); // جمعه
});

test("weekend nights are Wednesday through Friday", () => {
  assert.equal(isWeekendNight("2025-08-20"), true); // چهارشنبه
  assert.equal(isWeekendNight("2025-08-21"), true); // پنجشنبه
  assert.equal(isWeekendNight("2025-08-22"), true); // جمعه
  assert.equal(isWeekendNight("2025-08-16"), false); // شنبه
  assert.equal(isWeekendNight("2025-08-19"), false); // سه‌شنبه
});

test("jalali month bounds round-trip", () => {
  const start = jalaliMonthStart(1404, 5);
  const end = jalaliMonthEnd(1404, 5);
  assert.equal(toJalali(start), "۱۴۰۴/۰۵/۰۱");
  assert.equal(toJalali(end), "۱۴۰۴/۰۵/۳۱");
  assert.equal(diffDays(start, end) + 1, 31);
});

test("Nowruz is detected as a holiday", () => {
  assert.equal(holidayName(jalaliMonthStart(1405, 1)), "نوروز");
});

/* -------------------------------------------------------------------------- */
/*                                Night ledger                                */
/* -------------------------------------------------------------------------- */

const range = { start: "2025-08-01", end: "2025-08-10" };

const reservations: Reservation[] = [
  {
    id: "a",
    checkIn: "2025-08-02",
    checkOut: "2025-08-05",
    guests: 2,
    status: "completed",
    grossAmount: 3_000_000,
    platformFee: 300_000,
    discount: 0,
    refund: 0,
  },
  {
    id: "b",
    checkIn: "2025-08-08",
    checkOut: "2025-08-09",
    guests: 4,
    status: "cancelled",
    grossAmount: 1_000_000,
    platformFee: 0,
    discount: 0,
    refund: 800_000,
  },
];

const blocked: BlockedNight[] = [{ date: "2025-08-07", reason: "maintenance" }];

test("ledger spreads revenue evenly across nights", () => {
  const ledger = buildNightLedger(reservations, blocked, range);
  assert.equal(ledger.size, 10);

  const booked = [...ledger.values()].filter((n) => n.state === "booked");
  assert.equal(booked.length, 3, "3 nights booked (checkout excluded)");
  for (const night of booked) {
    assert.equal(night.revenue, 1_000_000);
    assert.equal(night.fee, 100_000);
  }
});

test("cancelled reservations never occupy a night", () => {
  const ledger = buildNightLedger(reservations, blocked, range);
  assert.equal(ledger.get("2025-08-08")?.state, "open");
  assert.equal(ledger.get("2025-08-08")?.revenue, 0);
});

test("blocked nights are marked and excluded from availability", () => {
  const ledger = buildNightLedger(reservations, blocked, range);
  assert.equal(ledger.get("2025-08-07")?.state, "blocked");
});

/* -------------------------------------------------------------------------- */
/*                                    KPIs                                    */
/* -------------------------------------------------------------------------- */

test("occupancy excludes owner-blocked nights from the denominator", () => {
  const kpis = computeKpis(
    { reservations, blockedNights: blocked, expenses: [], views: [], dailyPrices: [] },
    range,
  );

  assert.equal(kpis.totalNights, 10);
  assert.equal(kpis.blockedNights, 1);
  assert.equal(kpis.availableNights, 9);
  assert.equal(kpis.bookedNights, 3);
  assert.equal(kpis.occupancyRate, 3 / 9);
});

test("ADR, RevPAN and net profit follow their documented definitions", () => {
  const kpis = computeKpis(
    {
      reservations,
      blockedNights: blocked,
      expenses: [{ date: "2025-08-03", category: "نظافت", amount: 500_000 }],
      views: [],
      dailyPrices: [],
    },
    range,
  );

  assert.equal(kpis.grossRevenue, 3_000_000);
  assert.equal(kpis.adr, 1_000_000); // 3,000,000 / 3 nights
  assert.equal(kpis.revpan, 3_000_000 / 9);
  assert.equal(kpis.platformFees, 300_000);
  assert.equal(kpis.expenses, 500_000);
  assert.equal(kpis.netProfit, 2_200_000);
});

test("cancellation rate counts cancelled against all reservations", () => {
  const kpis = computeKpis(
    { reservations, blockedNights: blocked, expenses: [], views: [], dailyPrices: [] },
    range,
  );
  assert.equal(kpis.reservationsCount, 1);
  assert.equal(kpis.cancelledCount, 1);
  assert.equal(kpis.cancellationRate, 0.5);
});

test("conversion rate is null when no view data exists", () => {
  const kpis = computeKpis(
    { reservations, blockedNights: blocked, expenses: [], views: [], dailyPrices: [] },
    range,
  );
  assert.equal(kpis.conversionRate, null);
});

test("a stay straddling two months splits its revenue across both", () => {
  const straddling: Reservation[] = [
    {
      id: "s",
      checkIn: "2025-08-21", // 30 مرداد 1404
      checkOut: "2025-08-25", // 3 شهریور 1404
      guests: 2,
      status: "completed",
      grossAmount: 4_000_000,
      platformFee: 0,
      discount: 0,
      refund: 0,
    },
  ];

  const series = computeMonthlySeries(
    { reservations: straddling, blockedNights: [], expenses: [], views: [], dailyPrices: [] },
    { start: "2025-08-15", end: "2025-09-05" },
  );

  assert.equal(series.length, 2);
  const total = series.reduce((sum, month) => sum + month.revenue, 0);
  assert.equal(total, 4_000_000);
  assert.ok(series.every((m) => m.revenue > 0), "both months earn revenue");
});

/* -------------------------------------------------------------------------- */
/*                                 Statistics                                 */
/* -------------------------------------------------------------------------- */

test("median handles odd and even lengths", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("quantile interpolates between points", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([10, 20, 30], 0), 10);
  assert.equal(quantile([10, 20, 30], 1), 30);
});

test("percentileOf places a value inside its distribution", () => {
  assert.equal(percentileOf([1, 2, 3, 4], 0), 0);
  assert.equal(percentileOf([1, 2, 3, 4], 5), 100);
  assert.equal(percentileOf([1, 2, 3, 4], 2), 37.5);
});

/* -------------------------------------------------------------------------- */
/*                            Competitor similarity                           */
/* -------------------------------------------------------------------------- */

const property: Property = {
  id: "p",
  title: "کلبه",
  area: "سیدکلا",
  city: "بابلکنار",
  province: "مازندران",
  propertyType: "کلبه دربست",
  capacity: 4,
  extraCapacity: 2,
  bedrooms: 1,
  amenities: ["استخر", "جکوزی", "پارکینگ"],
  basePrice: 2_400_000,
  weekendPrice: 3_650_000,
  rating: 5,
  reviewsCount: 9,
};

test("a near-identical neighbour scores higher than a distant different one", () => {
  const near: Competitor = {
    id: "n",
    title: "همسایه",
    area: "سیدکلا",
    distanceKm: 1,
    propertyType: "کلبه دربست",
    capacity: 4,
    bedrooms: 1,
    weekdayPrice: 2_300_000,
    amenities: ["استخر", "جکوزی", "پارکینگ"],
  };
  const far: Competitor = {
    id: "f",
    title: "دور",
    area: "جای دیگر",
    distanceKm: 30,
    propertyType: "سوئیت",
    capacity: 10,
    bedrooms: 4,
    weekdayPrice: 9_000_000,
    amenities: ["صبحانه"],
  };

  const nearScore = scoreCompetitor(property, near);
  const farScore = scoreCompetitor(property, far);

  assert.ok(nearScore.similarity > 0.9, `expected >0.9, got ${nearScore.similarity}`);
  assert.ok(farScore.similarity < 0.3, `expected <0.3, got ${farScore.similarity}`);
  assert.ok(nearScore.reasons.length >= 3);
});

test("market position finds amenities the host is missing", () => {
  const competitors: Competitor[] = Array.from({ length: 4 }, (_, i) => ({
    id: `c${i}`,
    title: `c${i}`,
    area: "بابلکنار",
    propertyType: "کلبه دربست",
    capacity: 4,
    bedrooms: 1,
    weekdayPrice: 2_000_000 + i * 100_000,
    weekendPrice: 3_000_000,
    rating: 4.5,
    reviewsCount: 10,
    amenities: ["آتشدان", "پارکینگ"],
  }));

  const position = computeMarketPosition(property, competitors);
  assert.equal(position.sampleSize, 4);
  assert.equal(position.medianWeekday, 2_150_000);
  assert.ok(position.missingAmenities.some((a) => a.name === "آتشدان"));
  assert.ok(position.uniqueAmenities.some((a) => a.name === "استخر"));
  assert.equal(position.weekdayPercentile, 100, "host is pricier than every competitor");
});

/* -------------------------------------------------------------------------- */
/*                                CSV parsing                                 */
/* -------------------------------------------------------------------------- */

test("parseCsv handles quotes, embedded commas and BOM", () => {
  const rows = parseCsv('\uFEFFa,b\n"x,1","he said ""hi"""\n');
  assert.deepEqual(rows, [{ a: "x,1", b: 'he said "hi"' }]);
});

test("parseCsv detects a semicolon delimiter", () => {
  assert.deepEqual(parseCsv("a;b\n1;2"), [{ a: "1", b: "2" }]);
});

test("toNumber strips Persian digits, separators and currency words", () => {
  assert.equal(toNumber("۲٬۴۰۰٬۰۰۰ تومان"), 2_400_000);
  assert.equal(toNumber("2,400,000"), 2_400_000);
  assert.equal(toNumber("1500.5"), 1500.5);
  assert.equal(toNumber("abc"), null);
  assert.equal(toNumber(""), null);
});

test("normalizeDigits converts Persian and Arabic numerals", () => {
  assert.equal(normalizeDigits("۱۲۳"), "123");
  assert.equal(normalizeDigits("١٢٣"), "123");
});

test("toList splits on Persian and Latin separators", () => {
  assert.deepEqual(toList("استخر, جکوزی | پارکینگ"), ["استخر", "جکوزی", "پارکینگ"]);
  assert.deepEqual(toList(""), []);
});

/* -------------------------------------------------------------------------- */
/*                              Date normalisation                            */
/* -------------------------------------------------------------------------- */

test("toIsoDate accepts Jalali, Gregorian and Persian digits", () => {
  assert.equal(toIsoDate("1404/05/26"), "2025-08-17");
  assert.equal(toIsoDate("1404-05-26"), "2025-08-17");
  assert.equal(toIsoDate("۱۴۰۴/۰۵/۲۶"), "2025-08-17");
  assert.equal(toIsoDate("2025-08-17"), "2025-08-17");
  assert.equal(toIsoDate("not a date"), null);
});

/* -------------------------------------------------------------------------- */
/*                                 Demo data                                  */
/* -------------------------------------------------------------------------- */

test("the demo dataset is deterministic and internally consistent", () => {
  const first = buildDemoDataset();
  const second = buildDemoDataset();

  assert.equal(first.reservations.length, second.reservations.length);
  assert.deepEqual(first.reservations[0], second.reservations[0]);
  assert.ok(first.reservations.length > 50, "enough reservations for a year of data");

  for (const reservation of first.reservations) {
    assert.ok(reservation.checkOut > reservation.checkIn, "checkout after check-in");
    assert.ok(reservation.grossAmount > 0);
    assert.ok(reservation.checkIn >= first.range.start);
    assert.ok(reservation.checkOut <= addDays(first.range.end, 1));
  }
});

test("demo KPIs land in a believable range", () => {
  const demo = buildDemoDataset();
  const kpis = computeKpis(demo, demo.range);

  assert.ok(kpis.occupancyRate > 0.2 && kpis.occupancyRate < 0.95, `occupancy ${kpis.occupancyRate}`);
  assert.ok(kpis.adr > 1_000_000 && kpis.adr < 10_000_000, `adr ${kpis.adr}`);
  assert.ok(kpis.revpan <= kpis.adr, "RevPAN never exceeds ADR");
  assert.ok(kpis.netProfit < kpis.grossRevenue, "fees and expenses reduce profit");
  assert.ok(kpis.weekendAdr > kpis.weekdayAdr, "weekends price higher in the demo");
});
