import type { CalendarNight } from "./jajiga/analytics";
import type { ExpenseRow, ReservationRow } from "./db/schemas";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from "./db/schemas";
import { nightsBetween } from "./dates";

export const COMMISSION_RATE = 0.16;

/**
 * True-profit math for one period: revenue comes from the radar calendar
 * (inferred bookings) merged with the host's own recorded reservations, which
 * take precedence; costs come from the expenses table. Pure functions — no IO —
 * so they are testable against fixtures.
 */

export interface RevenueNight {
  date: string;
  amount: number; // effective (after discount) toman for that night
  source: "manual" | "radar";
}

/**
 * Merge radar-inferred booked nights with manually recorded reservations.
 * A manual reservation owns every night it covers: radar inference for those
 * nights is discarded (the host's own record is ground truth). Manual amounts
 * are spread evenly across the stay's nights.
 */
export function mergeRevenueNights(
  radarNights: CalendarNight[],
  reservations: ReservationRow[],
  from: string,
  to: string,
): RevenueNight[] {
  const byDate = new Map<string, RevenueNight>();

  for (const night of radarNights) {
    if (night.date < from || night.date > to) continue;
    if (night.state !== "booked") continue;
    byDate.set(night.date, {
      date: night.date,
      amount: night.effectivePrice ?? 0,
      source: "radar",
    });
  }

  for (const stay of reservations) {
    if (stay.status !== "confirmed") continue;
    const nights = nightsBetween(stay.checkIn, stay.checkOut);
    if (!nights.length) continue;
    const perNight = Math.round((stay.grossAmount - stay.discountAmount) / nights.length);
    for (const date of nights) {
      if (date < from || date > to) continue;
      byDate.set(date, { date, amount: perNight, source: "manual" });
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface CategoryBreakdown {
  category: (typeof EXPENSE_CATEGORIES)[number];
  label: string;
  amount: number;
  share: number;
}

export interface ProfitSummary {
  grossRevenue: number;
  commission: number;
  netRevenue: number;
  totalExpenses: number;
  /** The number the whole phase exists for: net revenue − expenses. */
  realProfit: number;
  profitMargin: number | null;
  expenseToRevenue: number | null;
  soldNights: number;
  manualNights: number;
  radarNights: number;
  profitPerSoldNight: number | null;
  byCategory: CategoryBreakdown[];
}

export function computeProfit(
  revenueNights: RevenueNight[],
  expenses: ExpenseRow[],
): ProfitSummary {
  const grossRevenue = revenueNights.reduce((sum, night) => sum + night.amount, 0);
  const commission = Math.round(grossRevenue * COMMISSION_RATE);
  const netRevenue = grossRevenue - commission;
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const realProfit = netRevenue - totalExpenses;

  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }
  const byCategory: CategoryBreakdown[] = EXPENSE_CATEGORIES.filter((category) =>
    totals.has(category),
  )
    .map((category) => ({
      category,
      label: EXPENSE_CATEGORY_LABEL[category],
      amount: totals.get(category) ?? 0,
      share: totalExpenses > 0 ? (totals.get(category) ?? 0) / totalExpenses : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const soldNights = revenueNights.length;

  return {
    byCategory,
    grossRevenue,
    commission,
    netRevenue,
    totalExpenses,
    realProfit,
    profitMargin: grossRevenue > 0 ? realProfit / grossRevenue : null,
    expenseToRevenue: grossRevenue > 0 ? totalExpenses / grossRevenue : null,
    soldNights,
    manualNights: revenueNights.filter((night) => night.source === "manual").length,
    radarNights: revenueNights.filter((night) => night.source === "radar").length,
    profitPerSoldNight: soldNights > 0 ? Math.round(realProfit / soldNights) : null,
  };
}
