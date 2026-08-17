import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  diffDays,
  holidayName,
  isWeekendNight,
  jalaliMonthEnd,
  jalaliMonthStart,
  jalaliWeekday,
  nightsBetween,
  toJalali,
} from "../src/lib/dates";
import { median, percentileOf, quantile, safeDivide } from "../src/lib/metrics";
import {
  analyzeReviews,
  buildRevenueLeaderboard,
  computeCalendarKpis,
  computeMarketPosition,
  computeMonthlyFromCalendar,
  computeWeekdayProfile,
  extractReviewTopics,
  haversineKm,
  rankCompetitors,
  readCalendar,
  scoreCompetitor,
  selectPeers,
} from "../src/lib/jajiga/analytics";
import type { CalendarNight } from "../src/lib/jajiga/analytics";
import {
  buildMarketNightIndex,
  computeMarketWeekdayProfile,
  qualityMultiplier,
  roomRateSplit,
  suggestNightPrice,
} from "../src/lib/jajiga/pricing";
import { buildInsights } from "../src/lib/jajiga/insights";
import type { RoomProfile } from "../src/lib/jajiga/load";
import type { RadarFile, Review, RevenueRoom } from "../src/lib/jajiga/schemas";

/* -------------------------------------------------------------------------- */
/*                                    Dates                                   */
/* -------------------------------------------------------------------------- */

test("nightsBetween excludes the checkout night", () => {
  assert.deepEqual(nightsBetween("2025-08-17", "2025-08-20"), [
    "2025-08-17",
    "2025-08-18",
    "2025-08-19",
  ]);
  assert.deepEqual(nightsBetween("2025-08-17", "2025-08-17"), []);
});

test("jalali weekday indexes Saturday as 0", () => {
  assert.equal(jalaliWeekday("2025-08-16"), 0); // شنبه
  assert.equal(jalaliWeekday("2025-08-17"), 1); // یکشنبه
  assert.equal(jalaliWeekday("2025-08-22"), 6); // جمعه
});

test("weekend nights are Wednesday through Friday", () => {
  assert.equal(isWeekendNight("2025-08-20"), true); // چهارشنبه
  assert.equal(isWeekendNight("2025-08-21"), true); // پنجشنبه
  assert.equal(isWeekendNight("2025-08-22"), true); // جمعه
  assert.equal(isWeekendNight("2025-08-16"), false); // شنبه
  assert.equal(isWeekendNight("2025-08-19"), false); // سه‌شنبه
});

test("jalali month bounds round-trip", () => {
  const start = jalaliMonthStart(1404, 5);
  const end = jalaliMonthEnd(1404, 5);
  assert.equal(diffDays(start, end) + 1, 31); // مرداد always has 31 days
  assert.match(toJalali(start), /^۱۴۰۴/);
});

test("Nowruz is detected as a holiday", () => {
  assert.equal(holidayName(jalaliMonthStart(1405, 1)), "نوروز");
  assert.equal(holidayName(addDays(jalaliMonthStart(1405, 1), 45)), null);
});

/* -------------------------------------------------------------------------- */
/*                                  Numerics                                  */
/* -------------------------------------------------------------------------- */

test("median handles odd and even lengths", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("quantile interpolates between points", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([10, 20], 0.25), 12.5);
});

test("percentileOf places a value inside its distribution", () => {
  assert.equal(percentileOf([1, 2, 3, 4], 3), 62.5);
  assert.equal(percentileOf([5, 5, 5], 5), 50);
});

test("safeDivide never divides by zero", () => {
  assert.equal(safeDivide(10, 0), 0);
  assert.equal(safeDivide(10, 4), 2.5);
});

/* -------------------------------------------------------------------------- */
/*                          Calendar / radar semantics                        */
/* -------------------------------------------------------------------------- */

function radar(nights: RadarFile["nights"]): RadarFile {
  return {
    room_id: 3297585,
    meta: { title: "تست", host_name: null },
    fetched_at: "2026-08-17T09:00:00Z",
    nights,
  } as RadarFile;
}

test("a manually blocked night is never counted as booked", () => {
  const file = radar([
    { date: "2026-09-01", price: 2_000_000, discount: 0, is_unavailable: true },
    { date: "2026-09-02", price: 2_000_000, discount: 0, is_unavailable: true },
  ]);

  const nights = readCalendar(file, new Set(["2026-09-01"]), "2026-08-17");

  assert.equal(nights[0].state, "blocked");
  assert.equal(nights[1].state, "booked");
});

test("occupancy excludes owner-blocked nights from the denominator", () => {
  const file = radar([
    { date: "2026-09-01", price: 1_000_000, discount: 0, is_unavailable: true },
    { date: "2026-09-02", price: 1_000_000, discount: 0, is_unavailable: true },
    { date: "2026-09-03", price: 1_000_000, discount: 0 },
    { date: "2026-09-04", price: 1_000_000, discount: 0 },
  ]);

  const kpis = computeCalendarKpis(readCalendar(file, new Set(["2026-09-01"]), "2026-08-17"));

  assert.equal(kpis.blockedNights, 1);
  assert.equal(kpis.bookedNights, 1);
  assert.equal(kpis.availableNights, 3);
  assert.equal(kpis.occupancyRate, 1 / 3);
});

test("the listing discount is applied before revenue and commission", () => {
  const file = radar([
    { date: "2026-09-01", price: 2_000_000, discount: 20, is_unavailable: true },
    { date: "2026-09-02", price: 2_000_000, discount: 0 },
  ]);

  const kpis = computeCalendarKpis(readCalendar(file, undefined, "2026-08-17"));

  assert.equal(kpis.grossRevenue, 1_600_000);
  assert.equal(kpis.commission, 192_000); // 12٪
  assert.equal(kpis.netRevenue, 1_408_000);
  assert.equal(kpis.adr, 1_600_000);
  assert.equal(kpis.revpan, 800_000); // spread over both available nights
});

test("monthly buckets split a calendar across Jalali months", () => {
  // 1405-05-29، 1405-06-03 و 1405-07-03 — three distinct Jalali months.
  const file = radar([
    { date: "2026-08-20", price: 1_000_000, discount: 0, is_unavailable: true },
    { date: "2026-08-25", price: 1_000_000, discount: 0 },
    { date: "2026-09-25", price: 1_000_000, discount: 0, is_unavailable: true },
  ]);

  const monthly = computeMonthlyFromCalendar(readCalendar(file, undefined, "2026-08-17"));

  assert.equal(monthly.length, 3);
  assert.deepEqual(
    monthly.map((m) => m.key),
    [...monthly.map((m) => m.key)].sort(),
    "buckets must be chronological",
  );
  assert.equal(monthly.reduce((a, m) => a + m.booked, 0), 2);
  assert.equal(monthly.reduce((a, m) => a + m.available, 0), 3);
});

test("weekday profile assigns Friday nights to جمعه", () => {
  const file = radar([
    { date: "2026-08-21", price: 3_000_000, discount: 0, is_unavailable: true }, // Friday
  ]);

  const profile = computeWeekdayProfile(readCalendar(file, undefined, "2026-08-17"));
  const friday = profile.find((p) => p.day === "جمعه");

  assert.ok(friday);
  assert.equal(friday.occupancy, 1);
  assert.equal(friday.adr, 3_000_000);
});

/* -------------------------------------------------------------------------- */
/*                                 Competitors                                */
/* -------------------------------------------------------------------------- */

function room(overrides: Partial<RoomProfile> = {}): RoomProfile {
  return {
    id: 1,
    title: "کلبه",
    url: "",
    village: "سیدکلا",
    isOwn: false,
    status: "active",
    propertyType: "کلبه",
    types: ["cottage", "swiss_cottage"],
    bedrooms: 1,
    floorArea: 100,
    landArea: 200,
    capacity: 4,
    maxCapacity: 6,
    beds: { double: 1, mattress: 4, single: 0, sofaBed: 0 },
    basePrice: 2_400_000,
    extraGuestFee: 750_000,
    minStay: 1,
    cancellationPolicy: "middle",
    discounts: [],
    currentDiscountPercent: 0,
    features: ["wifi", "parking"],
    featureLabels: ["اینترنت", "پارکینگ"],
    featureDescriptions: {},
    featuresCount: 2,
    badges: [],
    isPlus: false,
    isInstant: false,
    rating: 4.8,
    reviewsCount: 10,
    successBooks: 5,
    subRatings: {
      accuracy: 5,
      communication: 5,
      cleanliness: 5,
      location: 5,
      checkin: 5,
      value: 4.8,
    },
    host: {
      id: 1,
      name: "میزبان",
      acceptRate: 90,
      responseTimeMinutes: 60,
      communicationRate: 5,
    },
    occupancy30: 0.1,
    occupancy30Booked: 3,
    occupancy30Total: 30,
    geo: { lat: 36.4, lng: 52.6 },
    ...overrides,
  } as RoomProfile;
}

test("haversine measures a short village distance sensibly", () => {
  const km = haversineKm({ lat: 36.4, lng: 52.6 }, { lat: 36.41, lng: 52.6 });
  assert.ok(km > 1 && km < 1.3, `expected ~1.1 km, got ${km}`);
});

test("a near-identical neighbour scores higher than a bigger pool villa", () => {
  const owner = room({ id: 1 });
  const twin = room({ id: 2, geo: { lat: 36.401, lng: 52.601 } });
  const villa = room({
    id: 3,
    capacity: 8,
    bedrooms: 3,
    types: ["villa"],
    features: ["pool", "jacuzzi"],
    geo: { lat: 36.45, lng: 52.7 },
  });

  const twinScore = scoreCompetitor(owner, twin).similarity;
  const villaScore = scoreCompetitor(owner, villa).similarity;

  assert.ok(twinScore > villaScore, `${twinScore} should beat ${villaScore}`);
  assert.ok(twinScore > 0.9);
  assert.ok(villaScore < 0.5);
});

test("the owner is excluded from its own competitor ranking", () => {
  const owner = room({ id: 1 });
  const ranked = rankCompetitors(owner, [owner, room({ id: 2 }), room({ id: 3 })]);
  assert.equal(ranked.length, 2);
  assert.ok(ranked.every((r) => r.id !== 1));
});

test("peer selection prefers strong matches but never returns nothing", () => {
  const owner = room({ id: 1 });

  const manyTwins = Array.from({ length: 30 }, (_, i) => room({ id: i + 2 }));
  assert.equal(selectPeers(rankCompetitors(owner, manyTwins), 20).length, 20);

  // Nothing similar at all: still fall back to the closest available rooms.
  const dissimilar = Array.from({ length: 4 }, (_, i) =>
    room({
      id: i + 2,
      capacity: 12,
      bedrooms: 4,
      types: ["villa"],
      features: ["pool"],
      geo: { lat: 37.5, lng: 53.5 },
    }),
  );
  assert.equal(selectPeers(rankCompetitors(owner, dissimilar), 20).length, 4);
});

test("market position finds amenities the host is missing", () => {
  const owner = room({ id: 1, features: ["wifi"], basePrice: 2_000_000 });
  const peers = [
    room({ id: 2, features: ["wifi", "pool"], basePrice: 2_400_000 }),
    room({ id: 3, features: ["wifi", "pool"], basePrice: 2_600_000 }),
    room({ id: 4, features: ["wifi", "pool"], basePrice: 3_000_000 }),
  ];

  const position = computeMarketPosition(owner, peers);

  assert.equal(position.sampleSize, 3);
  assert.equal(position.medianPrice, 2_600_000);
  assert.ok(position.pricePercentile < 50);
  assert.ok(position.missingFeatures.some((f) => f.code === "pool" && f.share === 1));
});

/* -------------------------------------------------------------------------- */
/*                                   Revenue                                  */
/* -------------------------------------------------------------------------- */

test("the leaderboard ranks by net revenue and flags the owner", () => {
  const rooms: RevenueRoom[] = [
    {
      id: 3297585,
      title: "کلبه شما",
      booked: 5,
      free: 10,
      gross: 12_000_000,
      gross_discounted: 11_850_000,
      discount_total: 150_000,
      commission: 1_422_000,
      net: 10_428_000,
    },
    {
      id: 999,
      title: "کلبه استخردار",
      booked: 11,
      free: 4,
      gross: 106_000_000,
      gross_discounted: 105_500_000,
      discount_total: 500_000,
      commission: 12_660_000,
      net: 92_840_000,
    },
  ] as RevenueRoom[];

  const board = buildRevenueLeaderboard(rooms, 3297585);

  assert.equal(board[0].id, "999");
  assert.equal(board[0].rank, 1);
  assert.equal(board[1].rank, 2);
  assert.equal(board[1].isOwn, true);
  assert.equal(board[1].adr, 11_850_000 / 5);
});

test("commission is twelve percent of the discounted gross", () => {
  const board = buildRevenueLeaderboard(
    [
      {
        id: 1,
        title: "x",
        booked: 1,
        free: 0,
        gross: 1_000_000,
        gross_discounted: 1_000_000,
        commission: 120_000,
        net: 880_000,
      },
    ] as RevenueRoom[],
    1,
  );

  assert.equal(board[0].commission / board[0].grossDiscounted, 0.12);
  assert.equal(board[0].grossDiscounted - board[0].commission, board[0].net);
});

/* -------------------------------------------------------------------------- */
/*                              Market price index                            */
/* -------------------------------------------------------------------------- */

function peerRadar(id: number, nights: RadarFile["nights"]): RadarFile {
  return { room_id: id, meta: {}, fetched_at: "", nights } as RadarFile;
}

test("the price index medians only open nights and discounts them", () => {
  const index = buildMarketNightIndex(
    [
      peerRadar(2, [{ date: "2026-09-01", price: 2_000_000, discount: 0 }]),
      peerRadar(3, [{ date: "2026-09-01", price: 3_000_000, discount: 0 }]),
      peerRadar(4, [{ date: "2026-09-01", price: 4_000_000, discount: 50 }]),
      // Unavailable: its stale price must not enter the distribution, but it
      // still counts towards market occupancy.
      peerRadar(5, [{ date: "2026-09-01", price: 9_000_000, discount: 0, is_unavailable: true }]),
    ],
    undefined,
    1,
  );

  const night = index.get("2026-09-01");
  assert.ok(night);
  assert.equal(night.samples, 3);
  assert.equal(night.median, 2_000_000); // 2M, 2M (4M −50%), 3M
  assert.equal(night.marketOccupancy, 0.25);
});

test("the price index skips the owner and honours the peer filter", () => {
  const rooms = [
    peerRadar(1, [{ date: "2026-09-01", price: 9_000_000, discount: 0 }]),
    peerRadar(2, [{ date: "2026-09-01", price: 2_000_000, discount: 0 }]),
    peerRadar(3, [{ date: "2026-09-01", price: 3_000_000, discount: 0 }]),
  ];

  assert.equal(buildMarketNightIndex(rooms, undefined, 1).get("2026-09-01")?.samples, 2);
  assert.equal(buildMarketNightIndex(rooms, new Set([2]), 1).get("2026-09-01")?.samples, 1);
});

test("a top-rated listing earns a premium over the market median", () => {
  assert.ok(qualityMultiplier(5) > 1);
  assert.ok(qualityMultiplier(4.7) === 1);
  assert.ok(qualityMultiplier(3.9) < 1);
  assert.ok(qualityMultiplier(null) < 1);
});

test("nights without enough real samples get NO suggestion instead of a synthetic one", () => {
  const index = buildMarketNightIndex(
    [peerRadar(2, [{ date: "2026-09-01", price: 2_000_000, discount: 0 }])],
    undefined,
    1,
  );

  const thin = suggestNightPrice("2026-09-01", index, { rating: 4.7 });
  assert.equal(thin.samples, 1);
  assert.equal(thin.market, null, "a single sample must not produce a market figure");
  assert.equal(thin.min, null);
  assert.equal(thin.max, null);

  const empty = suggestNightPrice("2027-01-01", index, { rating: 4.7 });
  assert.equal(empty.samples, 0);
  assert.equal(empty.market, null);
  assert.equal(empty.center, null);
});

test("nights with enough real samples produce a band around the observed median", () => {
  const index = buildMarketNightIndex(
    [
      peerRadar(2, [{ date: "2026-09-01", price: 2_000_000, discount: 0 }]),
      peerRadar(3, [{ date: "2026-09-01", price: 2_500_000, discount: 0 }]),
      peerRadar(4, [{ date: "2026-09-01", price: 3_000_000, discount: 0 }]),
    ],
    undefined,
    1,
  );

  const night = suggestNightPrice("2026-09-01", index, { rating: 4.7 });
  assert.equal(night.samples, 3);
  assert.equal(night.market, 2_500_000);
  assert.ok(night.min !== null && night.center !== null && night.max !== null);
  assert.ok(night.min < night.center && night.center < night.max);
});

test("rate split separates weekend from weekday and ignores sold nights", () => {
  const split = roomRateSplit(
    peerRadar(2, [
      { date: "2026-08-17", price: 2_000_000, discount: 0 }, // دوشنبه
      { date: "2026-08-18", price: 2_000_000, discount: 0 }, // سه‌شنبه
      { date: "2026-08-20", price: 4_000_000, discount: 0 }, // پنجشنبه
      { date: "2026-08-21", price: 4_000_000, discount: 0 }, // جمعه
      // Sold out: its price is stale and must not move either median.
      { date: "2026-08-22", price: 9_000_000, discount: 0, is_unavailable: true },
    ]),
  );

  assert.equal(split.weekday, 2_000_000);
  assert.equal(split.weekend, 4_000_000);
});

test("the weekday profile is market-wide and overlays the owner's own rate", () => {
  const owner = readCalendar(
    radar([{ date: "2026-08-21", price: 5_000_000, discount: 0 }]), // جمعه
    undefined,
    "2026-08-17",
  );

  const profile = computeMarketWeekdayProfile(
    [
      peerRadar(2, [{ date: "2026-08-21", price: 3_000_000, discount: 0 }]),
      peerRadar(3, [{ date: "2026-08-21", price: 3_000_000, discount: 0, is_unavailable: true }]),
      // The owner's own radar file must never pollute the market side.
      peerRadar(3297585, [{ date: "2026-08-21", price: 9_000_000, discount: 0 }]),
    ],
    owner,
    undefined,
    3297585,
  );

  const friday = profile.find((p) => p.day === "جمعه");
  assert.ok(friday);
  assert.equal(friday.marketPrice, 3_000_000);
  assert.equal(friday.ownerPrice, 5_000_000);
  assert.equal(friday.marketOccupancy, 0.5);
  assert.equal(profile.length, 7, "every weekday is represented, even when empty");
});

/* -------------------------------------------------------------------------- */
/*                              Pricing insights                              */
/* -------------------------------------------------------------------------- */

const INSIGHT_BASE = {
  market: {
    sampleSize: 20,
    medianPrice: 2_495_000,
    p25: 2_000_000,
    p75: 2_592_500,
    pricePercentile: 40,
    medianRating: 4.8,
    ratingPercentile: 93,
    medianReviews: 20,
    medianOccupancy: 0.08,
    ownerOccupancy: 0.06,
    missingFeatures: [],
    uniqueFeatures: [],
  },
  calendar: computeCalendarKpis([]),
  reviews: null,
  reviewTopics: [],
  leaderboard: [],
  peerCount: 20,
};

test("a cheap card price does not mask an expensive calendar", () => {
  const insights = buildInsights({
    ...INSIGHT_BASE,
    owner: room({ id: 3297585, basePrice: 2_400_000, rating: 5 }),
    ownerRate: { weekday: 3_200_000, weekend: 3_650_000 },
    marketRate: { weekday: 2_345_000, weekend: 3_000_000 },
  });

  const ids = insights.map((i) => i.id);
  assert.ok(ids.includes("real-rate-gap"), "the real rate gap must be reported");
  assert.ok(
    !ids.includes("quality-price-mismatch"),
    "charging above market is not a quality/price bargain",
  );
  assert.ok(!ids.includes("underpriced"), "the card price must not claim underpricing");
  assert.equal(insights.find((i) => i.id === "real-rate-gap")?.tone, "warning");
});

test("a genuinely cheap listing is still flagged as an opportunity", () => {
  const insights = buildInsights({
    ...INSIGHT_BASE,
    owner: room({ id: 3297585, basePrice: 1_800_000, rating: 5 }),
    ownerRate: { weekday: 1_800_000, weekend: 2_000_000 },
    marketRate: { weekday: 2_400_000, weekend: 3_000_000 },
  });

  const gap = insights.find((i) => i.id === "real-rate-gap");
  assert.ok(gap);
  assert.equal(gap.tone, "opportunity");
});

test("a flat calendar is flagged when the market charges more at weekends", () => {
  const insights = buildInsights({
    ...INSIGHT_BASE,
    owner: room({ id: 3297585, basePrice: 2_400_000 }),
    ownerRate: { weekday: 2_400_000, weekend: 2_400_000 },
    marketRate: { weekday: 2_400_000, weekend: 3_200_000 },
  });

  assert.ok(insights.some((i) => i.id === "no-weekend-uplift"));
});

/* -------------------------------------------------------------------------- */
/*                                   Reviews                                  */
/* -------------------------------------------------------------------------- */

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: Math.random(),
    content: "عالی بود",
    created_at: "2026-07-01T10:00:00Z",
    user: { name: "مهمان" },
    host_reply: null,
    rating: 5,
    ...overrides,
  } as Review;
}

test("review analysis reports reply rate and the star distribution", () => {
  const analysis = analyzeReviews([
    review({ rating: 5, host_reply: { content: "ممنون" } as Review["host_reply"] }),
    review({ rating: 5 }),
    review({ rating: 4 }),
    review({ rating: null }),
  ]);

  assert.equal(analysis.count, 4);
  assert.equal(analysis.ratedCount, 3);
  assert.equal(analysis.averageRating, 4.67);
  assert.equal(analysis.replyRate, 0.25);
  assert.equal(analysis.distribution.find((d) => d.stars === 5)?.count, 2);
});

test("topic extraction separates praise from complaints", () => {
  const topics = extractReviewTopics([
    review({ content: "خیلی تمیز بود و ویو فوق‌العاده داشت" }),
    review({ content: "همه چیز خوب بود ولی پشه زیاد داشت" }),
    review({ content: "نظافت عالی" }),
  ]);

  const cleanliness = topics.find((t) => t.topic === "نظافت");
  const insects = topics.find((t) => t.topic === "حشرات");

  assert.equal(cleanliness?.count, 2);
  assert.equal(cleanliness?.tone, "positive");
  assert.equal(insects?.count, 1);
  assert.equal(insects?.tone, "negative");
});

/* -------------------------------------------------------------------------- */
/*                          End-to-end on the real data                       */
/* -------------------------------------------------------------------------- */

test("the real dataset loads without schema errors", async () => {
  const { getDataset } = await import("../src/lib/jajiga/dataset");
  const data = getDataset();

  assert.equal(data.isEmpty, false, "owner listing 3297585 must be present");
  assert.deepEqual(data.issues, [], "every data file must parse");
  assert.ok(data.rooms.length > 50);
  assert.ok(data.peers.length >= 8);
  assert.ok(data.calendar.length > 0);
  assert.ok(data.marketNights.size > 0);
  assert.ok(data.insights.length >= 3);
  assert.equal(data.owner.id, 3297585);
  assert.equal(data.marketWeekday.length, 7);
  assert.ok(data.ownerRate && data.ownerRate.weekday > 0);
  assert.ok(data.marketRate && data.marketRate.weekday > 0);
});

test("owner KPIs stay internally consistent on the real data", async () => {
  const { getDataset } = await import("../src/lib/jajiga/dataset");
  const { calendar, calendarKpis: k } = getDataset();

  assert.equal(
    k.bookedNights + k.blockedNights + k.openNights,
    calendar.length,
    "every night has exactly one state",
  );
  assert.equal(k.availableNights, calendar.length - k.blockedNights);
  assert.ok(k.occupancyRate >= 0 && k.occupancyRate <= 1);
  assert.ok(Math.abs(k.grossRevenue - k.commission - k.netRevenue) < 1);
  assert.ok(k.revpan <= k.adr || k.bookedNights === 0);

  const monthly = getDataset().monthly;
  const booked = monthly.reduce((a: number, m) => a + m.booked, 0);
  assert.equal(booked, k.bookedNights, "monthly buckets must sum to the total");
});

test("calendar nights are typed exhaustively", async () => {
  const { getDataset } = await import("../src/lib/jajiga/dataset");
  const states = new Set(getDataset().calendar.map((n: CalendarNight) => n.state));
  for (const state of states) {
    assert.ok(["booked", "blocked", "open"].includes(state), `unexpected state ${state}`);
  }
});
