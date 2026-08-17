import { addDays, jalaliMonthEnd, jalaliMonthStart, jalaliParts, shiftJalaliMonth, toISO } from "./dates";
import type { Period } from "./metrics";

export type PeriodKey = "last3" | "last6" | "last12" | "ytd" | "all";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "last3", label: "۳ ماه اخیر" },
  { key: "last6", label: "۶ ماه اخیر" },
  { key: "last12", label: "۱۲ ماه اخیر" },
  { key: "ytd", label: "از ابتدای سال" },
  { key: "all", label: "کل بازه" },
];

export function isPeriodKey(value: string | undefined): value is PeriodKey {
  return !!value && PERIOD_OPTIONS.some((o) => o.key === value);
}

/**
 * Resolve a period selector against the dataset bounds. `anchor` is the last
 * day the data can meaningfully describe — normally today, clamped into the
 * dataset range so a purely historical dataset still renders.
 */
export function resolvePeriod(
  key: PeriodKey,
  range: { start: string; end: string },
  today = toISO(new Date()),
): Period {
  const anchor = today > range.end ? range.end : today < range.start ? range.end : today;
  const { year, month } = jalaliParts(anchor);

  if (key === "all") return { start: range.start, end: range.end };

  if (key === "ytd") {
    const start = jalaliMonthStart(year, 1);
    return { start: start < range.start ? range.start : start, end: anchor };
  }

  const months = key === "last3" ? 3 : key === "last6" ? 6 : 12;
  const shifted = shiftJalaliMonth(year, month, -(months - 1));
  const start = jalaliMonthStart(shifted.year, shifted.month);
  const end = jalaliMonthEnd(year, month);

  return {
    start: start < range.start ? range.start : start,
    end: end > range.end ? range.end : end,
  };
}

/** The equally long window immediately before `period`, for delta comparisons. */
export function previousPeriod(period: Period, range: { start: string; end: string }): Period | null {
  const lengthDays = Math.max(
    1,
    Math.round(
      (new Date(period.end).getTime() - new Date(period.start).getTime()) / 86_400_000,
    ) + 1,
  );
  const end = addDays(period.start, -1);
  const start = addDays(end, -(lengthDays - 1));
  if (end < range.start) return null;
  return { start: start < range.start ? range.start : start, end };
}
