import assert from "node:assert/strict";
import test from "node:test";

import type { ExpenseRow, ReservationRow } from "../src/lib/db/schemas";
import { computeProfit, mergeRevenueNights } from "../src/lib/finance";
import type { CalendarNight } from "../src/lib/jajiga/analytics";

function night(date: string, state: CalendarNight["state"], effectivePrice: number | null): CalendarNight {
  return {
    date,
    state,
    price: effectivePrice,
    effectivePrice,
    discountPercent: 0,
    isWeekend: false,
  } as CalendarNight;
}

function stay(overrides: Partial<ReservationRow>): ReservationRow {
  return {
    id: 1,
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    guests: 2,
    grossAmount: 6_000_000,
    discountAmount: 0,
    source: "manual",
    status: "confirmed",
    note: "",
    createdAt: "",
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRow>): ExpenseRow {
  return {
    id: 1,
    date: "2026-09-05",
    amount: 500_000,
    category: "cleaning",
    note: "",
    recurringId: null,
    createdAt: "",
    ...overrides,
  };
}

test("manual reservations override radar inference for the nights they cover", () => {
  const radar = [
    night("2026-09-01", "booked", 3_000_000), // covered by the manual stay
    night("2026-09-02", "booked", 3_000_000), // covered by the manual stay
    night("2026-09-05", "booked", 2_800_000), // radar only
    night("2026-09-06", "open", 2_800_000),   // open: no revenue
  ];
  const merged = mergeRevenueNights(radar, [stay({ grossAmount: 6_000_000 })], "2026-09-01", "2026-09-30");

  assert.equal(merged.length, 3);
  const first = merged.find((n) => n.date === "2026-09-01");
  assert.equal(first?.source, "manual");
  assert.equal(first?.amount, 3_000_000, "manual amount is spread across nights (6M / 2)");
  assert.equal(merged.find((n) => n.date === "2026-09-05")?.source, "radar");
});

test("cancelled reservations contribute nothing", () => {
  const merged = mergeRevenueNights(
    [],
    [stay({ status: "cancelled" })],
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(merged.length, 0);
});

test("manual reservation discount reduces the per-night amount", () => {
  const merged = mergeRevenueNights(
    [],
    [stay({ grossAmount: 6_000_000, discountAmount: 1_000_000 })],
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(merged[0].amount, 2_500_000); // (6M − 1M) / 2 nights
});

test("nights outside the requested window are ignored", () => {
  const merged = mergeRevenueNights(
    [night("2026-08-31", "booked", 2_000_000)],
    [stay({ checkIn: "2026-09-29", checkOut: "2026-10-02", grossAmount: 9_000_000 })],
    "2026-09-01",
    "2026-09-30",
  );
  // Only the two September nights of the manual stay survive.
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((n) => n.date),
    ["2026-09-29", "2026-09-30"],
  );
});

test("real profit = gross − 12٪ commission − expenses, with category breakdown", () => {
  const revenue = mergeRevenueNights(
    [night("2026-09-01", "booked", 5_000_000), night("2026-09-02", "booked", 5_000_000)],
    [],
    "2026-09-01",
    "2026-09-30",
  );
  const profit = computeProfit(revenue, [
    expense({ amount: 700_000, category: "cleaning" }),
    expense({ id: 2, amount: 300_000, category: "repairs" }),
  ]);

  assert.equal(profit.grossRevenue, 10_000_000);
  assert.equal(profit.commission, 1_200_000);
  assert.equal(profit.netRevenue, 8_800_000);
  assert.equal(profit.totalExpenses, 1_000_000);
  assert.equal(profit.realProfit, 7_800_000);
  assert.equal(profit.soldNights, 2);
  assert.equal(profit.profitPerSoldNight, 3_900_000);

  assert.equal(profit.byCategory.length, 2);
  assert.equal(profit.byCategory[0].category, "cleaning");
  assert.equal(profit.byCategory[0].share, 0.7);
});

test("profit handles a month with expenses but no revenue", () => {
  const profit = computeProfit([], [expense({ amount: 400_000 })]);
  assert.equal(profit.realProfit, -400_000);
  assert.equal(profit.profitMargin, null);
  assert.equal(profit.expenseToRevenue, null);
  assert.equal(profit.profitPerSoldNight, null);
});
