import { WEEKDAY_LABELS, jalaliWeekday } from "./dates";
import { buildNightLedger, mean, safeDivide } from "./metrics";
import type { Period } from "./metrics";
import type { Dataset } from "./types";

/** Occupancy and rate profile per Jalali weekday (شنبه … جمعه). */
export function computeWeekdayProfile(
  dataset: Pick<Dataset, "reservations" | "blockedNights" | "dailyPrices">,
  period: Period,
) {
  const ledger = buildNightLedger(
    dataset.reservations,
    dataset.blockedNights,
    period,
    dataset.dailyPrices,
  );

  const buckets = WEEKDAY_LABELS.map((day) => ({
    day,
    booked: 0,
    available: 0,
    revenue: [] as number[],
  }));

  for (const night of ledger.values()) {
    const index = jalaliWeekday(night.date);
    const bucket = buckets[index];
    if (!bucket) continue;
    if (night.state !== "blocked") bucket.available += 1;
    if (night.state === "booked") {
      bucket.booked += 1;
      bucket.revenue.push(night.revenue);
    }
  }

  return buckets.map((bucket) => ({
    day: bucket.day,
    occupancy: safeDivide(bucket.booked, bucket.available),
    adr: Math.round(mean(bucket.revenue)),
  }));
}

/** Expense totals by category, largest first. */
export function computeExpenseBreakdown(dataset: Pick<Dataset, "expenses">, period: Period) {
  const totals = new Map<string, number>();
  for (const expense of dataset.expenses) {
    if (expense.date < period.start || expense.date > period.end) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, share: safeDivide(amount, grand) }))
    .sort((a, b) => b.amount - a.amount);
}

/** Upcoming stays for the operational panel on the overview page. */
export function upcomingReservations(dataset: Pick<Dataset, "reservations">, today: string) {
  return dataset.reservations
    .filter((r) => r.status !== "cancelled" && r.checkIn >= today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 6);
}
