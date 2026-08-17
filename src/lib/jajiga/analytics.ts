import { isWeekendNight, jalaliMonthKey, toJalaliMonthShort } from "../dates";
import { mean, median, percentileOf, quantile, safeDivide } from "../metrics";
import { COMMISSION_RATE, FEATURE_LABELS } from "./features";
import type { RadarFile, RadarNight, RevenueRoom, Review } from "./schemas";
import type { RoomProfile } from "./load";

/* -------------------------------------------------------------------------- */
/*                          Radar calendar interpretation                      */
/* -------------------------------------------------------------------------- */

export type NightState = "booked" | "blocked" | "open";

export interface CalendarNight {
  date: string;
  state: NightState;
  price: number | null;
  discountPercent: number;
  /** price after the listing-level discount shown by Jajiga. */
  effectivePrice: number | null;
  isWeekend: boolean;
  isInstant: boolean;
  isPast: boolean;
}

/**
 * Convert a radar file into typed nights.
 *
 * Critical rule from DATA-GUIDE §5.3: `is_unavailable` means **booked OR
 * manually blocked**. Manual blocks earn zero revenue and must be excluded
 * from the occupancy denominator, so they get their own state.
 */
export function readCalendar(
  radar: RadarFile,
  manualBlocks: Set<string> | undefined,
  today: string,
): CalendarNight[] {
  return radar.nights.map((night: RadarNight) => {
    const blockedManually =
      night.is_manual_block === true || manualBlocks?.has(night.date) === true;

    const state: NightState = blockedManually
      ? "blocked"
      : night.is_unavailable === true
        ? "booked"
        : "open";

    const price = typeof night.price === "number" ? night.price : null;
    const discountPercent = typeof night.discount === "number" ? night.discount : 0;

    return {
      date: night.date,
      state,
      price,
      discountPercent,
      effectivePrice: price === null ? null : Math.round(price * (1 - discountPercent / 100)),
      // Prefer the API's own weekend flag; fall back to the Jalali rule.
      isWeekend: night.is_weekend ?? isWeekendNight(night.date),
      isInstant: night.is_instant === true,
      isPast: night.date < today,
    };
  });
}

export interface CalendarKpis {
  totalNights: number;
  bookedNights: number;
  blockedNights: number;
  openNights: number;
  availableNights: number;
  occupancyRate: number;
  /** Gross accommodation value of booked nights, after listing discount. */
  grossRevenue: number;
  commission: number;
  netRevenue: number;
  adr: number;
  revpan: number;
  avgListPrice: number;
  weekendAdr: number;
  weekdayAdr: number;
  weekendOccupancy: number;
  weekdayOccupancy: number;
  rangeStart: string;
  rangeEnd: string;
}

export function computeCalendarKpis(nights: CalendarNight[]): CalendarKpis {
  const booked = nights.filter((n) => n.state === "booked");
  const blocked = nights.filter((n) => n.state === "blocked");
  const open = nights.filter((n) => n.state === "open");
  const available = nights.filter((n) => n.state !== "blocked");

  const bookedRevenue = booked.reduce((sum, n) => sum + (n.effectivePrice ?? 0), 0);
  const commission = bookedRevenue * COMMISSION_RATE;

  const weekendNights = available.filter((n) => n.isWeekend);
  const weekdayNights = available.filter((n) => !n.isWeekend);
  const weekendBooked = weekendNights.filter((n) => n.state === "booked");
  const weekdayBooked = weekdayNights.filter((n) => !n.isWeekend && n.state === "booked");

  const dates = nights.map((n) => n.date).sort();

  return {
    totalNights: nights.length,
    bookedNights: booked.length,
    blockedNights: blocked.length,
    openNights: open.length,
    availableNights: available.length,
    occupancyRate: safeDivide(booked.length, available.length),
    grossRevenue: bookedRevenue,
    commission,
    netRevenue: bookedRevenue - commission,
    adr: safeDivide(bookedRevenue, booked.length),
    revpan: safeDivide(bookedRevenue, available.length),
    avgListPrice: mean(nights.map((n) => n.price ?? 0).filter((p) => p > 0)),
    weekendAdr: mean(weekendBooked.map((n) => n.effectivePrice ?? 0).filter((p) => p > 0)),
    weekdayAdr: mean(weekdayBooked.map((n) => n.effectivePrice ?? 0).filter((p) => p > 0)),
    weekendOccupancy: safeDivide(weekendBooked.length, weekendNights.length),
    weekdayOccupancy: safeDivide(weekdayBooked.length, weekdayNights.length),
    rangeStart: dates[0] ?? "",
    rangeEnd: dates[dates.length - 1] ?? "",
  };
}

/** Group calendar nights into Jalali months for trend charts. */
export interface MonthlyPoint {
  key: string;
  label: string;
  booked: number;
  available: number;
  blocked: number;
  occupancyRate: number;
  revenue: number;
  adr: number;
  revpan: number;
}

export function computeMonthlyFromCalendar(nights: CalendarNight[]): MonthlyPoint[] {
  const buckets = new Map<string, CalendarNight[]>();
  for (const night of nights) {
    const key = jalaliMonthKey(night.date);
    const bucket = buckets.get(key) ?? [];
    bucket.push(night);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthNights]) => {
      const kpis = computeCalendarKpis(monthNights);
      return {
        key,
        label: toJalaliMonthShort(monthNights[0].date),
        booked: kpis.bookedNights,
        available: kpis.availableNights,
        blocked: kpis.blockedNights,
        occupancyRate: kpis.occupancyRate,
        revenue: Math.round(kpis.grossRevenue),
        adr: Math.round(kpis.adr),
        revpan: Math.round(kpis.revpan),
      };
    });
}

/** Occupancy + rate per Jalali weekday (شنبه … جمعه). */
export function computeWeekdayProfile(nights: CalendarNight[]) {
  const labels = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
  const buckets = labels.map((day) => ({ day, booked: 0, available: 0, prices: [] as number[] }));

  for (const night of nights) {
    if (night.state === "blocked") continue;
    // jalaliParts gives the Jalali day; weekday index derives from the date.
    const index = jalaliWeekdayIndex(night.date);
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.available += 1;
    if (night.state === "booked") {
      bucket.booked += 1;
      if (night.effectivePrice) bucket.prices.push(night.effectivePrice);
    }
  }

  return buckets.map((bucket) => ({
    day: bucket.day,
    occupancy: safeDivide(bucket.booked, bucket.available),
    adr: Math.round(mean(bucket.prices)),
  }));
}

function jalaliWeekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(y, m - 1, d, 12).getDay(); // 0 = Sunday
  return (js + 1) % 7; // 0 = Saturday
}

/* -------------------------------------------------------------------------- */
/*                             Market benchmarking                            */
/* -------------------------------------------------------------------------- */

export interface CompetitorMatch extends RoomProfile {
  similarity: number;
  reasons: string[];
  distanceKm: number | null;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Explainable similarity: capacity, bedrooms, real geo distance, property type
 * and amenity overlap. The host must be able to see why a listing counts as a
 * competitor, so every contribution also produces a Persian reason.
 */
export function scoreCompetitor(owner: RoomProfile, room: RoomProfile): CompetitorMatch {
  const reasons: string[] = [];

  // Capacity is the strongest signal: a 6-guest villa is not a substitute for
  // a 4-guest cabin even if it sits next door.
  const capacityGap = Math.abs(owner.capacity - room.capacity);
  const capacityScore = Math.max(0, 1 - capacityGap / 3);
  if (capacityGap === 0) reasons.push("ظرفیت برابر");
  else if (capacityGap === 1) reasons.push("ظرفیت نزدیک");

  const bedroomGap = Math.abs(owner.bedrooms - room.bedrooms);
  const bedroomScore = Math.max(0, 1 - bedroomGap / 2);
  if (bedroomGap === 0) reasons.push("تعداد اتاق برابر");

  // Every village here sits within a few km, so the distance curve must be
  // tight to stay discriminating.
  const distanceKm =
    owner.geo && room.geo ? Number(haversineKm(owner.geo, room.geo).toFixed(2)) : null;
  const distanceScore = distanceKm === null ? 0.4 : Math.max(0, 1 - distanceKm / 5);
  if (distanceKm !== null && distanceKm <= 1.5) reasons.push("فاصله بسیار کم");

  const sharedTypes = room.types.filter((t) => owner.types.includes(t));
  const specificMatch = sharedTypes.some((t) => t !== "cottage");
  const typeScore = specificMatch ? 1 : sharedTypes.length ? 0.7 : 0.35;
  if (sharedTypes.includes("swiss_cottage")) reasons.push("کلبه سوئیسی مثل شما");
  else if (specificMatch) reasons.push("نوع اقامتگاه یکسان");

  const shared = room.features.filter((f) => owner.features.includes(f));
  const union = new Set([...room.features, ...owner.features]);
  const amenityScore = union.size ? shared.length / union.size : 0;
  if (amenityScore >= 0.6) reasons.push("امکانات مشابه");

  // A pool or jacuzzi puts a listing in a different bracket entirely.
  const ownerPremium = owner.features.includes("pool") || owner.features.includes("jacuzzi");
  const roomPremium = room.features.includes("pool") || room.features.includes("jacuzzi");
  const premiumScore = ownerPremium === roomPremium ? 1 : 0.45;
  if (!ownerPremium && roomPremium) reasons.push("استخر/جکوزی دارد (شما ندارید)");

  if (room.village === owner.village) reasons.push("همان روستا");

  const similarity =
    capacityScore * 0.26 +
    bedroomScore * 0.14 +
    distanceScore * 0.2 +
    typeScore * 0.14 +
    amenityScore * 0.14 +
    premiumScore * 0.12;

  return { ...room, similarity, reasons, distanceKm };
}

export function rankCompetitors(owner: RoomProfile, rooms: RoomProfile[]): CompetitorMatch[] {
  return rooms
    .filter((room) => room.id !== owner.id && room.basePrice > 0)
    .map((room) => scoreCompetitor(owner, room))
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Pick the benchmark set.
 *
 * A fixed similarity threshold is fragile: in Babolkenar almost every listing
 * is a cabin within 4 km, so a low bar admits the whole village and a high bar
 * can return nothing. Taking the top N keeps the sample both relevant and
 * statistically usable.
 */
export function selectPeers(ranked: CompetitorMatch[], limit = 20): CompetitorMatch[] {
  const strong = ranked.filter((room) => room.similarity >= 0.75);
  if (strong.length >= limit) return strong.slice(0, limit);
  if (strong.length >= 8) return strong;
  return ranked.slice(0, Math.min(limit, ranked.length));
}

export interface MarketPosition {
  sampleSize: number;
  medianPrice: number;
  p25: number;
  p75: number;
  pricePercentile: number;
  medianRating: number;
  ratingPercentile: number;
  medianReviews: number;
  medianOccupancy: number | null;
  ownerOccupancy: number | null;
  missingFeatures: { code: string; label: string; share: number }[];
  uniqueFeatures: { code: string; label: string; share: number }[];
}

export function computeMarketPosition(
  owner: RoomProfile,
  competitors: RoomProfile[],
): MarketPosition {
  const prices = competitors.map((c) => c.basePrice).filter((p) => p > 0);
  const ratings = competitors.map((c) => c.rating).filter((r): r is number => r !== null);
  const reviews = competitors.map((c) => c.reviewsCount).filter((r) => r > 0);
  const occupancies = competitors
    .map((c) => c.occupancy30)
    .filter((o): o is number => o !== null);

  const featureCount = new Map<string, number>();
  for (const competitor of competitors) {
    for (const code of new Set(competitor.features)) {
      featureCount.set(code, (featureCount.get(code) ?? 0) + 1);
    }
  }
  const total = competitors.length || 1;

  const missingFeatures = [...featureCount.entries()]
    .filter(([code]) => !owner.features.includes(code))
    .map(([code, count]) => ({ code, label: featureLabelOf(code), share: count / total }))
    .filter((f) => f.share >= 0.25)
    .sort((a, b) => b.share - a.share);

  const uniqueFeatures = owner.features
    .map((code) => ({
      code,
      label: featureLabelOf(code),
      share: (featureCount.get(code) ?? 0) / total,
    }))
    .filter((f) => f.share <= 0.45)
    .sort((a, b) => a.share - b.share);

  return {
    sampleSize: competitors.length,
    medianPrice: median(prices),
    p25: quantile(prices, 0.25),
    p75: quantile(prices, 0.75),
    pricePercentile: percentileOf(prices, owner.basePrice),
    medianRating: median(ratings),
    ratingPercentile: owner.rating !== null ? percentileOf(ratings, owner.rating) : 0,
    medianReviews: median(reviews),
    medianOccupancy: occupancies.length ? median(occupancies) : null,
    ownerOccupancy: owner.occupancy30,
    missingFeatures,
    uniqueFeatures,
  };
}

function featureLabelOf(code: string): string {
  return FEATURE_LABELS[code] ?? code;
}

/* -------------------------------------------------------------------------- */
/*                                   Revenue                                  */
/* -------------------------------------------------------------------------- */

export interface RevenueLeaderboardRow {
  id: string;
  title: string;
  village: string;
  hostName: string | null;
  booked: number;
  free: number;
  gross: number;
  grossDiscounted: number;
  discountTotal: number;
  commission: number;
  net: number;
  adr: number;
  isOwn: boolean;
  rank: number;
}

export function buildRevenueLeaderboard(
  rooms: RevenueRoom[],
  ownerId = 3297585,
): RevenueLeaderboardRow[] {
  return rooms
    .map((room) => {
      const grossDiscounted =
        typeof room.gross_discounted === "number" ? room.gross_discounted : room.gross;
      return {
        id: String(room.id),
        title: room.title ?? String(room.id),
        village: room.village ?? "—",
        hostName: room.host_name ?? null,
        booked: room.booked,
        free: room.free ?? 0,
        gross: room.gross,
        grossDiscounted,
        discountTotal: room.discount_total ?? 0,
        commission: room.commission,
        net: room.net,
        adr: safeDivide(grossDiscounted, room.booked),
        isOwn: String(room.id) === String(ownerId),
        rank: 0,
      };
    })
    .sort((a, b) => b.net - a.net)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/* -------------------------------------------------------------------------- */
/*                                   Reviews                                  */
/* -------------------------------------------------------------------------- */

export interface ReviewAnalysis {
  count: number;
  averageRating: number | null;
  /** Ratings the API actually returned, vs the card count on the listing. */
  ratedCount: number;
  distribution: { stars: number; count: number }[];
  replyRate: number;
  latest: Review[];
  monthly: { key: string; label: string; count: number; average: number }[];
}

export function analyzeReviews(reviews: Review[]): ReviewAnalysis {
  const rated = reviews.filter((r) => typeof r.rating === "number");
  const ratings = rated.map((r) => r.rating as number);

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: ratings.filter((r) => Math.round(r) === stars).length,
  }));

  const monthlyMap = new Map<string, number[]>();
  for (const review of rated) {
    const iso = review.created_at.slice(0, 10);
    const key = jalaliMonthKey(iso);
    const bucket = monthlyMap.get(key) ?? [];
    bucket.push(review.rating as number);
    monthlyMap.set(key, bucket);
  }

  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        label: `${month}/${year}`,
        count: values.length,
        average: Number(mean(values).toFixed(2)),
      };
    });

  return {
    count: reviews.length,
    averageRating: ratings.length ? Number(mean(ratings).toFixed(2)) : null,
    ratedCount: ratings.length,
    distribution,
    replyRate: safeDivide(reviews.filter((r) => r.host_reply?.content).length, reviews.length),
    latest: [...reviews]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8),
    monthly,
  };
}

/** Rough keyword tagging so the host sees recurring praise/complaints. */
const REVIEW_TOPICS: { topic: string; tone: "positive" | "negative"; words: string[] }[] = [
  { topic: "نظافت", tone: "positive", words: ["تمیز", "نظافت", "پاکیزه"] },
  { topic: "چشم‌انداز", tone: "positive", words: ["ویو", "منظره", "چشم انداز", "طبیعت"] },
  { topic: "برخورد میزبان", tone: "positive", words: ["میزبان", "برخورد", "مهمان‌نواز", "مهمان نواز"] },
  { topic: "آرامش", tone: "positive", words: ["آرام", "دنج", "سکوت", "خلوت"] },
  { topic: "حشرات", tone: "negative", words: ["حشره", "پشه", "مگس", "توری"] },
  { topic: "دسترسی و جاده", tone: "negative", words: ["جاده", "شیب", "دسترسی", "مسیر"] },
  { topic: "آب", tone: "negative", words: ["آب شرب", "آب قابل شرب", "آب غیرقابل"] },
  { topic: "گرما و سرما", tone: "negative", words: ["گرم بود", "سرد بود", "کولر", "بخاری"] },
];

export function extractReviewTopics(reviews: Review[]) {
  return REVIEW_TOPICS.map((topic) => {
    const matches = reviews.filter((review) =>
      topic.words.some((word) => review.content.includes(word)),
    );
    return {
      topic: topic.topic,
      tone: topic.tone,
      count: matches.length,
      share: safeDivide(matches.length, reviews.length),
      sample: matches[0]?.content.slice(0, 160) ?? null,
    };
  })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
}
