import {
  addDays,
  demandSeason,
  holidayName,
  isWeekendNight,
  jalaliMonthEnd,
  jalaliMonthStart,
  jalaliParts,
  jalaliWeekday,
} from "./dates";
import { buildNightLedger, median } from "./metrics";
import type { Competitor, Dataset, Property } from "./types";

export interface CalendarDay {
  date: string;
  jalaliDay: number;
  /** 0 = شنبه … 6 = جمعه */
  weekday: number;
  isWeekend: boolean;
  holiday: string | null;
  season: "high" | "mid" | "low";
  state: "booked" | "blocked" | "open";
  /** The host's own list price for this night, when known. */
  price?: number;
  /** Median competitor price adjusted for weekend/season. */
  marketPrice: number;
  /** Suggested range, always presented as a برآورد. */
  suggestedMin: number;
  suggestedMax: number;
  /** Positive = above market, negative = below. */
  gap: number | null;
  isPast: boolean;
}

/** Market baseline: median competitor weekday/weekend price. */
export function marketBaseline(competitors: Competitor[]) {
  const weekday = median(competitors.map((c) => c.weekdayPrice).filter((p) => p > 0));
  const weekend = median(
    competitors.map((c) => c.weekendPrice ?? c.weekdayPrice).filter((p) => p > 0),
  );
  return { weekday, weekend: weekend || weekday };
}

/** Seasonal multipliers for northern Iran demand. */
const SEASON_MULTIPLIER: Record<"high" | "mid" | "low", number> = {
  high: 1.15,
  mid: 1,
  low: 0.87,
};

const HOLIDAY_MULTIPLIER = 1.12;

export function buildCalendarMonth(
  dataset: Pick<Dataset, "reservations" | "blockedNights" | "dailyPrices" | "competitors"> & {
    property: Property;
  },
  year: number,
  month: number,
  today: string,
): CalendarDay[] {
  const start = jalaliMonthStart(year, month);
  const end = jalaliMonthEnd(year, month);

  const ledger = buildNightLedger(
    dataset.reservations,
    dataset.blockedNights,
    { start, end },
    dataset.dailyPrices,
  );
  const priceByDate = new Map(dataset.dailyPrices.map((p) => [p.date, p.price]));
  const baseline = marketBaseline(dataset.competitors);

  const days: CalendarDay[] = [];
  let cursor = start;

  while (cursor <= end) {
    const record = ledger.get(cursor);
    const weekend = isWeekendNight(cursor);
    const season = demandSeason(cursor);
    const holiday = holidayName(cursor);

    let marketPrice = weekend ? baseline.weekend : baseline.weekday;
    marketPrice *= SEASON_MULTIPLIER[season];
    if (holiday) marketPrice *= HOLIDAY_MULTIPLIER;
    marketPrice = Math.round(marketPrice / 50_000) * 50_000;

    const price = priceByDate.get(cursor);

    // Suggested band: ±8% of the market-adjusted price, nudged up when the
    // property outperforms the market on rating.
    const ratingBonus =
      dataset.property.rating && dataset.property.rating >= 4.9
        ? 1.05
        : dataset.property.rating && dataset.property.rating >= 4.7
          ? 1.0
          : 0.95;
    const center = marketPrice * ratingBonus;

    days.push({
      date: cursor,
      jalaliDay: jalaliParts(cursor).day,
      weekday: jalaliWeekday(cursor),
      isWeekend: weekend,
      holiday,
      season,
      state: record?.state ?? "open",
      price,
      marketPrice,
      suggestedMin: Math.round((center * 0.92) / 50_000) * 50_000,
      suggestedMax: Math.round((center * 1.08) / 50_000) * 50_000,
      gap: price !== undefined && marketPrice > 0 ? (price - marketPrice) / marketPrice : null,
      isPast: cursor < today,
    });

    cursor = addDays(cursor, 1);
  }

  return days;
}

export interface CalendarSummary {
  bookedNights: number;
  openNights: number;
  blockedNights: number;
  occupancy: number;
  avgPrice: number;
  avgMarketPrice: number;
  underpricedNights: number;
  overpricedNights: number;
  holidays: { date: string; name: string }[];
  potentialUplift: number;
}

export function summarizeCalendar(days: CalendarDay[]): CalendarSummary {
  const booked = days.filter((d) => d.state === "booked");
  const blocked = days.filter((d) => d.state === "blocked");
  const open = days.filter((d) => d.state === "open");
  const available = days.filter((d) => d.state !== "blocked");

  const priced = days.filter((d) => d.price !== undefined);
  const under = priced.filter((d) => (d.gap ?? 0) < -0.1);
  const over = priced.filter((d) => (d.gap ?? 0) > 0.15);

  // Upside if every future underpriced open night moved to the suggested floor.
  const uplift = open
    .filter((d) => !d.isPast && d.price !== undefined && d.price < d.suggestedMin)
    .reduce((total, d) => total + (d.suggestedMin - (d.price ?? 0)), 0);

  return {
    bookedNights: booked.length,
    openNights: open.length,
    blockedNights: blocked.length,
    occupancy: available.length ? booked.length / available.length : 0,
    avgPrice: priced.length
      ? priced.reduce((a, d) => a + (d.price ?? 0), 0) / priced.length
      : 0,
    avgMarketPrice: days.length
      ? days.reduce((a, d) => a + d.marketPrice, 0) / days.length
      : 0,
    underpricedNights: under.length,
    overpricedNights: over.length,
    holidays: days
      .filter((d) => d.holiday)
      .map((d) => ({ date: d.date, name: d.holiday as string })),
    potentialUplift: uplift,
  };
}
