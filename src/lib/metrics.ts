import {
  addDays,
  diffDays,
  isWeekendNight,
  jalaliMonthKey,
  jalaliMonthStart,
  nightsBetween,
  toJalaliMonthShort,
} from "./dates";
import type {
  BlockedNight,
  Competitor,
  DailyPrice,
  Dataset,
  Property,
  Reservation,
} from "./types";

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** Share of `values` that are strictly below `value`, as a 0–100 percentile. */
export function percentileOf(values: number[], value: number): number {
  if (!values.length) return 0;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return ((below + equal / 2) / values.length) * 100;
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/* -------------------------------------------------------------------------- */
/*                              Night-level model                             */
/* -------------------------------------------------------------------------- */

export type NightState = "booked" | "blocked" | "open";

export interface NightRecord {
  date: string;
  state: NightState;
  /** Accommodation revenue allocated to this night (gross, before fees). */
  revenue: number;
  /** Platform fee allocated to this night. */
  fee: number;
  reservationId?: string;
  price?: number;
  isWeekend: boolean;
}

/**
 * Expand reservations into per-night records. Revenue of a multi-night stay is
 * spread evenly across its nights so that monthly reports do not jump when a
 * stay straddles two months.
 *
 * Cancelled reservations never occupy a night and never contribute revenue —
 * only their (non-refunded) retained amount is reported separately.
 */
export function buildNightLedger(
  reservations: Reservation[],
  blocked: BlockedNight[],
  range: { start: string; end: string },
  prices: DailyPrice[] = [],
): Map<string, NightRecord> {
  const ledger = new Map<string, NightRecord>();
  const priceByDate = new Map(prices.map((p) => [p.date, p.price]));

  const total = diffDays(range.start, range.end) + 1;
  for (let i = 0; i < total; i += 1) {
    const date = addDays(range.start, i);
    ledger.set(date, {
      date,
      state: "open",
      revenue: 0,
      fee: 0,
      price: priceByDate.get(date),
      isWeekend: isWeekendNight(date),
    });
  }

  for (const night of blocked) {
    const record = ledger.get(night.date);
    if (record && record.state === "open") record.state = "blocked";
  }

  for (const reservation of reservations) {
    if (reservation.status === "cancelled") continue;
    const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
    if (!nights.length) continue;
    const netGross = Math.max(reservation.grossAmount - reservation.refund, 0);
    const perNight = netGross / nights.length;
    const feePerNight = reservation.platformFee / nights.length;

    for (const date of nights) {
      const record = ledger.get(date);
      if (!record) continue;
      record.state = "booked";
      record.revenue += perNight;
      record.fee += feePerNight;
      record.reservationId = reservation.id;
    }
  }

  return ledger;
}

/* -------------------------------------------------------------------------- */
/*                                 Core KPIs                                  */
/* -------------------------------------------------------------------------- */

export interface Kpis {
  grossRevenue: number;
  platformFees: number;
  expenses: number;
  netProfit: number;
  bookedNights: number;
  blockedNights: number;
  availableNights: number;
  totalNights: number;
  occupancyRate: number;
  adr: number;
  revpan: number;
  reservationsCount: number;
  cancelledCount: number;
  cancellationRate: number;
  avgStayLength: number;
  avgGuests: number;
  views: number;
  conversionRate: number | null;
  weekendAdr: number;
  weekdayAdr: number;
}

export interface Period {
  start: string;
  end: string;
}

export function computeKpis(
  dataset: Pick<Dataset, "reservations" | "blockedNights" | "expenses" | "views" | "dailyPrices">,
  period: Period,
): Kpis {
  const inRange = (d: string) => d >= period.start && d <= period.end;

  const ledger = buildNightLedger(
    dataset.reservations,
    dataset.blockedNights,
    period,
    dataset.dailyPrices,
  );
  const nights = [...ledger.values()];

  const bookedNights = nights.filter((n) => n.state === "booked");
  const blockedNights = nights.filter((n) => n.state === "blocked");
  const availableNights = nights.length - blockedNights.length;

  const grossRevenue = sum(nights.map((n) => n.revenue));
  const platformFees = sum(nights.map((n) => n.fee));
  const expenses = sum(dataset.expenses.filter((e) => inRange(e.date)).map((e) => e.amount));

  // A reservation belongs to the period if any of its nights fall inside it.
  const activeReservations = dataset.reservations.filter((r) => {
    if (r.status === "cancelled") return false;
    return nightsBetween(r.checkIn, r.checkOut).some(inRange);
  });
  const cancelled = dataset.reservations.filter((r) => r.status === "cancelled" && inRange(r.checkIn));

  const periodViews = dataset.views.filter((v) => inRange(v.date));
  const viewsTotal = sum(periodViews.map((v) => v.views));

  const weekendBooked = bookedNights.filter((n) => n.isWeekend);
  const weekdayBooked = bookedNights.filter((n) => !n.isWeekend);

  const totalReservations = activeReservations.length + cancelled.length;

  return {
    grossRevenue,
    platformFees,
    expenses,
    netProfit: grossRevenue - platformFees - expenses,
    bookedNights: bookedNights.length,
    blockedNights: blockedNights.length,
    availableNights,
    totalNights: nights.length,
    occupancyRate: safeDivide(bookedNights.length, availableNights),
    adr: safeDivide(grossRevenue, bookedNights.length),
    revpan: safeDivide(grossRevenue, availableNights),
    reservationsCount: activeReservations.length,
    cancelledCount: cancelled.length,
    cancellationRate: safeDivide(cancelled.length, totalReservations),
    avgStayLength: mean(
      activeReservations.map((r) => nightsBetween(r.checkIn, r.checkOut).length),
    ),
    avgGuests: mean(activeReservations.map((r) => r.guests)),
    views: viewsTotal,
    conversionRate: viewsTotal > 0 ? safeDivide(activeReservations.length, viewsTotal) : null,
    weekendAdr: safeDivide(sum(weekendBooked.map((n) => n.revenue)), weekendBooked.length),
    weekdayAdr: safeDivide(sum(weekdayBooked.map((n) => n.revenue)), weekdayBooked.length),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Monthly time series                           */
/* -------------------------------------------------------------------------- */

export interface MonthlyPoint {
  key: string;
  label: string;
  isoStart: string;
  revenue: number;
  netProfit: number;
  bookedNights: number;
  availableNights: number;
  occupancyRate: number;
  adr: number;
  revpan: number;
  reservations: number;
  views: number;
}

export function computeMonthlySeries(
  dataset: Pick<Dataset, "reservations" | "blockedNights" | "expenses" | "views" | "dailyPrices">,
  period: Period,
): MonthlyPoint[] {
  const ledger = buildNightLedger(
    dataset.reservations,
    dataset.blockedNights,
    period,
    dataset.dailyPrices,
  );

  const buckets = new Map<
    string,
    {
      revenue: number;
      fee: number;
      booked: number;
      available: number;
      reservations: Set<string>;
    }
  >();

  for (const night of ledger.values()) {
    const key = jalaliMonthKey(night.date);
    const bucket = buckets.get(key) ?? {
      revenue: 0,
      fee: 0,
      booked: 0,
      available: 0,
      reservations: new Set<string>(),
    };
    bucket.revenue += night.revenue;
    bucket.fee += night.fee;
    if (night.state === "booked") bucket.booked += 1;
    if (night.state !== "blocked") bucket.available += 1;
    if (night.reservationId) bucket.reservations.add(night.reservationId);
    buckets.set(key, bucket);
  }

  const expenseByMonth = new Map<string, number>();
  for (const expense of dataset.expenses) {
    if (expense.date < period.start || expense.date > period.end) continue;
    const key = jalaliMonthKey(expense.date);
    expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + expense.amount);
  }

  const viewsByMonth = new Map<string, number>();
  for (const view of dataset.views) {
    if (view.date < period.start || view.date > period.end) continue;
    const key = jalaliMonthKey(view.date);
    viewsByMonth.set(key, (viewsByMonth.get(key) ?? 0) + view.views);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const [year, month] = key.split("-").map(Number);
      const isoStart = jalaliMonthStart(year, month);
      const expenses = expenseByMonth.get(key) ?? 0;
      return {
        key,
        label: toJalaliMonthShort(isoStart),
        isoStart,
        revenue: Math.round(bucket.revenue),
        netProfit: Math.round(bucket.revenue - bucket.fee - expenses),
        bookedNights: bucket.booked,
        availableNights: bucket.available,
        occupancyRate: safeDivide(bucket.booked, bucket.available),
        adr: Math.round(safeDivide(bucket.revenue, bucket.booked)),
        revpan: Math.round(safeDivide(bucket.revenue, bucket.available)),
        reservations: bucket.reservations.size,
        views: viewsByMonth.get(key) ?? 0,
      };
    });
}

/* -------------------------------------------------------------------------- */
/*                            Competitor benchmarking                         */
/* -------------------------------------------------------------------------- */

export interface CompetitorMatch extends Competitor {
  /** 0–1 similarity to the host property. */
  similarity: number;
  /** Human-readable reasons behind the similarity score. */
  reasons: string[];
}

/**
 * Similarity blends capacity, bedrooms, distance, property type and amenity
 * overlap. It is deliberately simple and explainable — a host must be able to
 * understand why a listing is called a competitor.
 */
export function scoreCompetitor(property: Property, competitor: Competitor): CompetitorMatch {
  const reasons: string[] = [];

  const capacityGap = Math.abs(property.capacity - competitor.capacity);
  const capacityScore = Math.max(0, 1 - capacityGap / 4);
  if (capacityGap <= 1) reasons.push("ظرفیت نزدیک");

  const bedroomGap = Math.abs(property.bedrooms - competitor.bedrooms);
  const bedroomScore = Math.max(0, 1 - bedroomGap / 2);
  if (bedroomGap === 0) reasons.push("تعداد اتاق برابر");

  const distance = competitor.distanceKm ?? 15;
  const distanceScore = Math.max(0, 1 - distance / 30);
  if (distance <= 8) reasons.push("فاصله کم");

  const typeScore = competitor.propertyType === property.propertyType ? 1 : 0.55;
  if (typeScore === 1) reasons.push("نوع اقامتگاه یکسان");

  const shared = competitor.amenities.filter((a) => property.amenities.includes(a));
  const union = new Set([...competitor.amenities, ...property.amenities]);
  const amenityScore = union.size ? shared.length / union.size : 0;
  if (amenityScore >= 0.5) reasons.push("امکانات مشابه");

  const similarity =
    capacityScore * 0.25 +
    bedroomScore * 0.15 +
    distanceScore * 0.25 +
    typeScore * 0.15 +
    amenityScore * 0.2;

  return { ...competitor, similarity, reasons };
}

export function rankCompetitors(property: Property, competitors: Competitor[]): CompetitorMatch[] {
  return competitors
    .map((c) => scoreCompetitor(property, c))
    .sort((a, b) => b.similarity - a.similarity);
}

export interface MarketPosition {
  sampleSize: number;
  medianWeekday: number;
  medianWeekend: number;
  p25Weekday: number;
  p75Weekday: number;
  weekdayPercentile: number;
  weekendPercentile: number;
  medianRating: number;
  ratingPercentile: number;
  medianReviews: number;
  /** Amenities most competitors have that the host property lacks. */
  missingAmenities: { name: string; share: number }[];
  /** Amenities the host has that most competitors lack. */
  uniqueAmenities: { name: string; share: number }[];
  /** Average share of unavailable public nights — an estimate, not occupancy. */
  availabilityEstimate: number | null;
}

export function computeMarketPosition(
  property: Property,
  competitors: Competitor[],
): MarketPosition {
  const weekdayPrices = competitors.map((c) => c.weekdayPrice).filter((p) => p > 0);
  const weekendPrices = competitors
    .map((c) => c.weekendPrice ?? c.weekdayPrice)
    .filter((p) => p > 0);
  const ratings = competitors.map((c) => c.rating).filter((r): r is number => typeof r === "number");
  const reviews = competitors
    .map((c) => c.reviewsCount)
    .filter((r): r is number => typeof r === "number");

  const hostWeekend = property.weekendPrice ?? property.basePrice;

  const amenityCount = new Map<string, number>();
  for (const competitor of competitors) {
    for (const amenity of new Set(competitor.amenities)) {
      amenityCount.set(amenity, (amenityCount.get(amenity) ?? 0) + 1);
    }
  }
  const total = competitors.length || 1;

  const missingAmenities = [...amenityCount.entries()]
    .filter(([name]) => !property.amenities.includes(name))
    .map(([name, count]) => ({ name, share: count / total }))
    .filter((a) => a.share >= 0.3)
    .sort((a, b) => b.share - a.share);

  const uniqueAmenities = property.amenities
    .map((name) => ({ name, share: (amenityCount.get(name) ?? 0) / total }))
    .filter((a) => a.share <= 0.4)
    .sort((a, b) => a.share - b.share);

  const availabilityValues = competitors
    .map((c) => c.unavailableShare)
    .filter((v): v is number => typeof v === "number");

  return {
    sampleSize: competitors.length,
    medianWeekday: median(weekdayPrices),
    medianWeekend: median(weekendPrices),
    p25Weekday: quantile(weekdayPrices, 0.25),
    p75Weekday: quantile(weekdayPrices, 0.75),
    weekdayPercentile: percentileOf(weekdayPrices, property.basePrice),
    weekendPercentile: percentileOf(weekendPrices, hostWeekend),
    medianRating: median(ratings),
    ratingPercentile: property.rating ? percentileOf(ratings, property.rating) : 0,
    medianReviews: median(reviews),
    missingAmenities,
    uniqueAmenities,
    availabilityEstimate: availabilityValues.length ? mean(availabilityValues) : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Formatting                                 */
/* -------------------------------------------------------------------------- */

const faNumber = new Intl.NumberFormat("fa-IR");

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Toman with Persian digits, e.g. `۲٬۴۰۰٬۰۰۰ تومان`. */
export function formatToman(value: number): string {
  return `${faNumber.format(Math.round(value))} تومان`;
}

/** Compact toman for chart axes and tight cards, e.g. `۲۴٫۵ م`. */
export function formatTomanShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 1)} میلیارد`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} م`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 0)} هزار`;
  return formatNumber(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${formatNumber(value * 100, digits)}٪`;
}

export function formatRating(value: number): string {
  return formatNumber(value, 1);
}
