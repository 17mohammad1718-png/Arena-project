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

const ROUND_TO = 50_000;

export interface PricingContext {
  /** Owner rating, used to justify a premium over the median. */
  rating: number | null;
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
  /** Observed market median for the night, or null when not enough real data. */
  market: number | null;
  min: number | null;
  max: number | null;
  center: number | null;
  samples: number;
  marketOccupancy: number;
}

/**
 * Suggest a price band for one night — strictly from observed competitor
 * prices. Nights with fewer than 3 real radar samples get NO suggestion
 * (null) instead of a synthesized formula-based estimate: the dashboard only
 * shows numbers that trace back to real data.
 */
export function suggestNightPrice(
  date: string,
  index: Map<string, MarketNight>,
  ctx: PricingContext,
): SuggestedNight {
  const entry = index.get(date);
  const samples = entry?.samples ?? 0;

  if (!entry || samples < 3) {
    return {
      market: null,
      center: null,
      min: null,
      max: null,
      samples,
      marketOccupancy: entry?.marketOccupancy ?? 0,
    };
  }

  const market = roundPrice(entry.median);

  // High market occupancy = scarcity, so the band can shift upward.
  const scarcity = 1 + Math.min(Math.max(entry.marketOccupancy - 0.2, 0), 0.5) * 0.24;

  const center = market * qualityMultiplier(ctx.rating) * scarcity;

  return {
    market,
    center: roundPrice(center),
    min: roundPrice(center * 0.93),
    max: roundPrice(center * 1.09),
    samples,
    marketOccupancy: entry.marketOccupancy,
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
  /** Observed market median for the night; null when not enough real samples. */
  market: number | null;
  suggestedMin: number | null;
  suggestedMax: number | null;
  suggestedCenter: number | null;
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
      effective !== null && suggestion.market !== null && suggestion.market > 0
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
    .filter(
      (d) =>
        !d.isPast &&
        d.effectivePrice !== null &&
        d.suggestedMin !== null &&
        d.effectivePrice < d.suggestedMin,
    )
    .reduce((total, d) => total + ((d.suggestedMin ?? 0) - (d.effectivePrice ?? 0)), 0);

  return {
    trackedNights: tracked.length,
    bookedNights: booked.length,
    openNights: open.length,
    blockedNights: blocked.length,
    occupancy: available.length ? booked.length / available.length : 0,
    avgPrice: priced.length
      ? priced.reduce((a, d) => a + (d.effectivePrice ?? 0), 0) / priced.length
      : 0,
    avgMarketPrice: (() => {
      const withMarket = tracked.filter((d) => d.market !== null);
      return withMarket.length
        ? withMarket.reduce((a, d) => a + (d.market ?? 0), 0) / withMarket.length
        : 0;
    })(),
    underpricedNights: under.length,
    overpricedNights: over.length,
    holidays: days
      .filter((d) => d.holiday)
      .map((d) => ({ date: d.date, name: d.holiday as string })),
    potentialUplift: uplift,
    bookedRevenue: booked.reduce((a, d) => a + (d.effectivePrice ?? 0), 0),
  };
}

/* -------------------------------------------------------------------------- */
/*                          Weekday demand, market-wide                       */
/* -------------------------------------------------------------------------- */

export interface WeekdayMarketPoint {
  day: string;
  /** Share of tracked competitor nights already taken on this weekday. */
  marketOccupancy: number;
  /** Median asking price competitors post for this weekday. */
  marketPrice: number;
  /** The owner's own asking price on this weekday. */
  ownerPrice: number;
  samples: number;
}

const WEEKDAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(y, m - 1, d, 12).getDay() + 1) % 7; // 0 = شنبه
}

/**
 * Weekday demand across the tracked market.
 *
 * The owner's own booked nights are far too few to form a weekday profile —
 * two nights produce a chart of zeros. What the host actually needs to know is
 * which weeknights *sell in this area* and what competitors charge for them,
 * so the profile is computed market-wide and the owner's asking price is
 * overlaid for comparison.
 */
export function computeMarketWeekdayProfile(
  radarRooms: RadarFile[],
  ownerNights: CalendarNight[],
  peerIds?: Set<number>,
  ownerId?: number,
): WeekdayMarketPoint[] {
  const buckets = WEEKDAY_NAMES.map(() => ({ prices: [] as number[], taken: 0, total: 0 }));

  for (const room of radarRooms) {
    if (room.room_id === ownerId) continue;
    if (peerIds && peerIds.size && !peerIds.has(room.room_id)) continue;

    for (const night of room.nights) {
      const bucket = buckets[weekdayIndex(night.date)];
      if (!bucket) continue;
      bucket.total += 1;
      if (night.is_unavailable === true) {
        bucket.taken += 1;
        continue;
      }
      if (typeof night.price === "number" && night.price > 0) {
        const discount = typeof night.discount === "number" ? night.discount : 0;
        bucket.prices.push(Math.round(night.price * (1 - discount / 100)));
      }
    }
  }

  const ownerBuckets = WEEKDAY_NAMES.map(() => [] as number[]);
  for (const night of ownerNights) {
    if (night.effectivePrice) ownerBuckets[weekdayIndex(night.date)].push(night.effectivePrice);
  }

  return WEEKDAY_NAMES.map((day, index) => {
    const bucket = buckets[index];
    const sorted = [...bucket.prices].sort((a, b) => a - b);
    const ownerSorted = [...ownerBuckets[index]].sort((a, b) => a - b);
    return {
      day,
      marketOccupancy: bucket.total ? bucket.taken / bucket.total : 0,
      marketPrice: Math.round(quantile(sorted, 0.5)),
      ownerPrice: Math.round(quantile(ownerSorted, 0.5)),
      samples: sorted.length,
    };
  });
}

/** Median weekday and weekend asking price for a single tracked room. */
export function roomRateSplit(room: RadarFile): { weekday: number; weekend: number } {
  const weekday: number[] = [];
  const weekend: number[] = [];

  for (const night of room.nights) {
    if (night.is_unavailable === true) continue;
    if (typeof night.price !== "number" || night.price <= 0) continue;
    const discount = typeof night.discount === "number" ? night.discount : 0;
    const price = Math.round(night.price * (1 - discount / 100));
    // Trust the feed's own weekend flag when present; fall back to the Iranian
    // convention of چهارشنبه–جمعه otherwise.
    const isWeekend =
      typeof night.is_weekend === "boolean" ? night.is_weekend : weekdayIndex(night.date) >= 4;
    (isWeekend ? weekend : weekday).push(price);
  }

  const med = (list: number[]) => Math.round(quantile([...list].sort((a, b) => a - b), 0.5));
  return { weekday: med(weekday), weekend: med(weekend) };
}
