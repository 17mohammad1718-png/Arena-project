import {
  addDays as jAddDays,
  differenceInCalendarDays,
  endOfMonth as jEndOfMonth,
  format as jFormat,
  getDay as jGetDay,
  newDate as jNewDate,
  parse as jParse,
  startOfMonth as jStartOfMonth,
} from "date-fns-jalali";

/** Parse an ISO `YYYY-MM-DD` string into a UTC-safe local Date. */
export function parseISO(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** Serialize a Date back to ISO `YYYY-MM-DD`. */
export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  return toISO(jAddDays(parseISO(date), days));
}

export function diffDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/** Every night occupied by a stay: check-in inclusive, checkout exclusive. */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const total = diffDays(checkIn, checkOut);
  if (total <= 0) return [];
  return Array.from({ length: total }, (_, i) => addDays(checkIn, i));
}

export function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/* -------------------------------------------------------------------------- */
/*                              Jalali formatting                             */
/* -------------------------------------------------------------------------- */

const PERSIAN_DIGITS = "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9";

/** Render ASCII digits as Persian digits for display strings. */
export function toPersianDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** e.g. `\u06f1\u06f4\u06f0\u06f4/\u06f0\u06f5/\u06f2\u06f6` */
export function toJalali(date: string): string {
  return toPersianDigits(jFormat(parseISO(date), "yyyy/MM/dd"));
}

/** e.g. `\u06f2\u06f6 \u0645\u0631\u062f\u0627\u062f \u06f1\u06f4\u06f0\u06f4` */
export function toJalaliLong(date: string): string {
  return toPersianDigits(jFormat(parseISO(date), "d MMMM yyyy"));
}

/** e.g. `\u0645\u0631\u062f\u0627\u062f \u06f1\u06f4\u06f0\u06f4` */
export function toJalaliMonthLabel(date: string): string {
  return toPersianDigits(jFormat(parseISO(date), "MMMM yyyy"));
}

/** Month name without the year, useful for chart axes. */
export function toJalaliMonthShort(date: string): string {
  return jFormat(parseISO(date), "MMMM");
}

/** Stable sortable key for a Jalali month, e.g. `1404-05`. */
export function jalaliMonthKey(date: string): string {
  return jFormat(parseISO(date), "yyyy-MM");
}

export function jalaliParts(date: string): { year: number; month: number; day: number } {
  const d = parseISO(date);
  return {
    year: Number(jFormat(d, "yyyy")),
    month: Number(jFormat(d, "MM")),
    day: Number(jFormat(d, "dd")),
  };
}

/** First Gregorian ISO day of the given Jalali year/month. */
export function jalaliMonthStart(year: number, month: number): string {
  return toISO(jStartOfMonth(jNewDate(year, month - 1, 1)));
}

/** Last Gregorian ISO day of the given Jalali year/month. */
export function jalaliMonthEnd(year: number, month: number): string {
  return toISO(jEndOfMonth(jNewDate(year, month - 1, 1)));
}

export function jalaliMonthLength(year: number, month: number): number {
  return diffDays(jalaliMonthStart(year, month), jalaliMonthEnd(year, month)) + 1;
}

export function parseJalaliKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

export function jalaliKeyToISO(key: string): string {
  const { year, month } = parseJalaliKey(key);
  return jalaliMonthStart(year, month);
}

export function shiftJalaliMonth(year: number, month: number, delta: number) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** 0 = شنبه … 6 = جمعه (the Iranian week starts on Saturday). */
export function jalaliWeekday(date: string): number {
  // getDay() is still Gregorian-indexed (0 = Sunday), so shift by one.
  return (jGetDay(parseISO(date)) + 1) % 7;
}

export const WEEKDAY_LABELS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

/**
 * In Iran the high-demand nights are Wednesday, Thursday and Friday, because
 * the weekend itself is Thursday evening → Friday.
 */
export function isWeekendNight(date: string): boolean {
  const d = jalaliWeekday(date);
  return d === 4 || d === 5 || d === 6; // چهارشنبه، پنجشنبه، جمعه
}

export function parseJalaliInput(value: string): string | null {
  const normalized = value.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/-/g, "/");
  const parsed = jParse(normalized, "yyyy/MM/dd", new Date());
  if (Number.isNaN(parsed.getTime())) return null;
  return toISO(parsed);
}

/* -------------------------------------------------------------------------- */
/*                            Iranian public holidays                         */
/* -------------------------------------------------------------------------- */

/**
 * Fixed solar (Jalali) public holidays. Lunar holidays move ~11 days per year
 * and are intentionally excluded — the UI labels this list as تقریبی so we
 * never present an incomplete calendar as authoritative.
 */
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "نوروز",
  "01-02": "نوروز",
  "01-03": "نوروز",
  "01-04": "نوروز",
  "01-12": "روز جمهوری اسلامی",
  "01-13": "سیزده‌بدر",
  "03-14": "رحلت امام خمینی",
  "03-15": "قیام ۱۵ خرداد",
  "11-22": "پیروزی انقلاب",
  "12-29": "ملی شدن صنعت نفت",
};

export function holidayName(date: string): string | null {
  const { month, day } = jalaliParts(date);
  const key = `${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  return FIXED_HOLIDAYS[key] ?? null;
}

/** Nowruz + سیزده‌بدر and the summer peak are the two demand spikes in شمال. */
export function demandSeason(date: string): "high" | "mid" | "low" {
  const { month, day } = jalaliParts(date);
  if (month === 1 && day <= 15) return "high";
  if (month >= 4 && month <= 6) return "high"; // تیر، مرداد، شهریور
  if (month === 2 || month === 3 || month === 7) return "mid";
  if (month === 12 && day >= 25) return "high";
  return "low";
}

export const SEASON_LABEL: Record<"high" | "mid" | "low", string> = {
  high: "تقاضای بالا",
  mid: "تقاضای متوسط",
  low: "تقاضای پایین",
};
