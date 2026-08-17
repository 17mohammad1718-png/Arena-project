import {
  addDays,
  demandSeason,
  holidayName,
  isWeekendNight,
  jalaliMonthEnd,
  jalaliMonthStart,
  jalaliParts,
  jalaliWeekday,
} from "../dates";
import type { CalendarNight } from "./analytics";
import type { RadarFile } from "./schemas";

/* -------------------------------------------------------------------------- */
/*                       Market price index, per night                        */
/* -------------------------------------------------------------------------- */

export interface MarketNight {
  date: string;
  /** Median listed price across radar rooms that published a price. */
  median: number;
  p25: number;
  p75: number;
  samples: number;
  /** Share of radar rooms already unavailable for this night. */
  marketOccupancy: number;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

/**
 * Build a per-date price index from the radar calendars.
 *
 * This is the single most valuable signal in the dataset: unlike the base
 * "from" price in pricing-dataset.json, radar records what each competitor is
 * *actually* asking on a specific night, including their weekend uplift.
 *
 * Only `peerIds` are counted when supplied, so the benchmark stays the same
 * comparable set used everywhere else in the app.
 */
export function buildMarketNightIndex(
  radarRooms: RadarFile[],
  peerIds?: Set<number>,
  ownerId?: number,
): Map<string, MarketNight> {
  const byDate = new Map<string, { prices: number[]; taken: number; total: number }>();

  for (const room of radarRooms) {
    if (room.room_id === ownerId) continue;
    if (peerIds && peerIds.size && !peerIds.has(room.room_id)) continue;

    for (const night of room.nights) {
      const bucket = byDate.get(night.date) ?? { prices: [], taken: 0, total: 0 };
      bucket.total += 1;
      if (night.is_unavailable === true) bucket.taken += 1;
      // A listed price on an unavailable night is stale, so only open nights
      // contribute to the asking-price distribution.
      if (typeof night.price === "number" && night.price > 0 && night.is_unavailable !== true) {
        const discount = typeof night.discount === "number" ? night.discount : 0;
        bucket.prices.push(Math.round(night.price * (1 - discount / 100)));
      }
      byDate.set(night.date, bucket);
    }
  }

  const index = new Map<string, MarketNight>();
  for (const [date, bucket] of byDate) {
    const sorted = [...bucket.prices].sort((a, b) => a - b);
    index.set(date, {
      date,
      median: Math.round(quantile(sorted, 0.5)),
      p25: Math.round(quantile(sorted, 0.25)),
      p75: Math.round(quantile(sorted, 0.75)),
      samples: sorted.length,
      marketOccupancy: bucket.total ? bucket.taken / bucket.total : 0,
    });
  }

  return index;
}

/* -------------------------------------------------------------------------- */
/*                              Suggested pricing                             */
/* -------------------------------------------------------------------------- */

const SEASON_MULTIPLIER: Record<"high" | "mid" | "low", number> = {
  high: 1.12,
  mid: 1,
  low: 0.9,
};

const HOLIDAY_MULTIPLIER = 1.12;
const ROUND_TO = 50_000;

export interface PricingContext {
  /** Owner rating, used to justify a premium over the median. */
  rating: number | null;
  /** Fallback median when a night has no radar samples. */
  fallbackMedian: number;
}

function roundPrice(value: number): number {
  return Math.round(value / ROUND_TO) * ROUND_TO;
}

/** Quality premium: a 5.0 listing can defend a price above the median. */
export function qualityMultiplier(rating: number | null): number {
  if (rating === null) return 0.97;
  if (rating >= 4.95) return 1.08;
  if (rating >= 4.8) return 1.03;
  if (rating >= 4.6) return 1;
  if (rating >= 4.2) return 0.95;
  return 0.9;
}

export interface SuggestedNight {
  market: number;
  min: number;
  max: number;
  center: number;
  samples: number;
  marketOccupancy: number;
}

export function suggestNightPrice(
  date: string,
  index: Map<string, MarketNight>,
  ctx: PricingContext,
): SuggestedNight {
  const entry = index.get(date);
  const samples = entry?.samples ?? 0;

  // With no live samples fall back to the base median adjusted for weekend and
  // season, so the calendar never shows an empty suggestion.
  let market = samples >= 3 ? entry!.median : ctx.fallbackMedian;
  if (samples < 3) {
    if (isWeekendNight(date)) market *= 1.15;
    market *= SEASON_MULTIPLIER[demandSeason(date)];
    if (holidayName(date)) market *= HOLIDAY_MULTIPLIER;
  } else if (holidayName(date)) {
    // Radar already prices the weekend and the season in; only holidays that
    // competitors may not have reacted to yet get an extra nudge.
    market *= HOLIDAY_MULTIPLIER;
  }

  market = roundPrice(market);

  // High market occupancy = scarcity, so the band can shift upward.
  const scarcity =
    entry && entry.samples >= 3
      ? 1 + Math.min(Math.max(entry.marketOccupancy - 0.2, 0), 0.5) * 0.24
      : 1;

  const center = market * qualityMultiplier(ctx.rating) * scarcity;

  return {
    market,
    center: roundPrice(center),
    min: roundPrice(center * 0.93),
    max: roundPrice(center * 1.09),
    samples,
    marketOccupancy: entry?.marketOccupancy ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                             Calendar month grid                            */
/* -------------------------------------------------------------------------- */

export type PriceVerdict = "underpriced" | "aligned" | "overpriced" | "unknown";

export interface CalendarDay {
  date: string;
  jalaliDay: number;
  /** 0 = شنبه … 6 = جمعه */
  weekday: number;
  isWeekend: boolean;
  holiday: string | null;
  season: "high" | "mid" | "low";
  state: "booked" | "blocked" | "open" | "unknown";
  /** The host's own list price for the night, as published. */
  price: number | null;
  /** Price after the listing-level discount. */
  effectivePrice: number | null;
  discountPercent: number;
  market: number;
  suggestedMin: number;
  suggestedMax: number;
  suggestedCenter: number;
  samples: number;
  marketOccupancy: number;
  gap: number | null;
  verdict: PriceVerdict;
  isPast: boolean;
  /** True when radar has no record for the night (outside the tracked window). */
  isTracked: boolean;
}

export function buildCalendarMonth(
  nights: CalendarNight[],
  index: Map<string, MarketNight>,
  ctx: PricingContext,
  year: number,
  month: number,
  today: string,
): CalendarDay[] {
  const byDate = new Map(nights.map((night) => [night.date, night]));
  const start = jalaliMonthStart(year, month);
  const end = jalaliMonthEnd(year, month);

  const days: CalendarDay[] = [];
  let cursor = start;

  while (cursor <= end) {
    const night = byDate.get(cursor);
    const suggestion = suggestNightPrice(cursor, index, ctx);
    const effective = night?.effectivePrice ?? null;

    const gap =
      effective !== null && suggestion.market > 0
        ? (effective - suggestion.market) / suggestion.market
        : null;

    let verdict: PriceVerdict = "unknown";
    if (gap !== null) {
      if (gap < -0.1) verdict = "underpriced";
      else if (gap > 0.15) verdict = "overpriced";
      else verdict = "aligned";
    }

    days.push({
      date: cursor,
      jalaliDay: jalaliParts(cursor).day,
      weekday: jalaliWeekday(cursor),
      isWeekend: isWeekendNight(cursor),
      holiday: holidayName(cursor),
      season: demandSeason(cursor),
      state: night?.state ?? "unknown",
      price: night?.price ?? null,
      effectivePrice: effective,
      discountPercent: night?.discountPercent ?? 0,
      market: suggestion.market,
      suggestedMin: suggestion.min,
      suggestedMax: suggestion.max,
      suggestedCenter: suggestion.center,
      samples: suggestion.samples,
      marketOccupancy: suggestion.marketOccupancy,
      gap,
      verdict,
      isPast: cursor < today,
      isTracked: night !== undefined,
    });

    cursor = addDays(cursor, 1);
  }

  return days;
}

export interface CalendarSummary {
  trackedNights: number;
  bookedNights: number;
  openNights: number;
  blockedNights: number;
  occupancy: number;
  avgPrice: number;
  avgMarketPrice: number;
  underpricedNights: number;
  overpricedNights: number;
  holidays: { date: string; name: string }[];
  /** Upside if every open, underpriced future night moved to the band floor. */
  potentialUplift: number;
  /** Revenue already secured for the month. */
  bookedRevenue: number;
}

export function summarizeCalendar(days: CalendarDay[]): CalendarSummary {
  const tracked = days.filter((d) => d.isTracked);
  const booked = tracked.filter((d) => d.state === "booked");
  const blocked = tracked.filter((d) => d.state === "blocked");
  const open = tracked.filter((d) => d.state === "open");
  const available = tracked.filter((d) => d.state !== "blocked");

  const priced = tracked.filter((d) => d.effectivePrice !== null);
  const under = priced.filter((d) => d.verdict === "underpriced");
  const over = priced.filter((d) => d.verdict === "overpriced");

  const uplift = open
    .filter((d) => !d.isPast && d.effectivePrice !== null && d.effectivePrice < d.suggestedMin)
    .reduce((total, d) => total + (d.suggestedMin - (d.effectivePrice ?? 0)), 0);

  return {
    trackedNights: tracked.length,
    bookedNights: booked.length,
    openNights: open.length,
    blockedNights: blocked.length,
    occupancy: available.length ? booked.length / available.length : 0,
    avgPrice: priced.length
      ? priced.reduce((a, d) => a + (d.effectivePrice ?? 0), 0) / priced.length
      : 0,
    avgMarketPrice: tracked.length
      ? tracked.reduce((a, d) => a + d.market, 0) / tracked.length
      : 0,
    underpricedNights: under.length,
    overpricedNights: over.length,
    holidays: days
      .filter((d) => d.holiday)
      .map((d) => ({ date: d.date, name: d.holiday as string })),
    potentialUplift: uplift,
    bookedRevenue: booked.reduce((a, d) => a + (d.effectivePrice ?? 0), 0),
  };
}
