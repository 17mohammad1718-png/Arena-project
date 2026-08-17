import { toISO, toJalaliLong } from "../dates";
import {
  analyzeReviews,
  buildRevenueLeaderboard,
  computeCalendarKpis,
  computeMarketPosition,
  computeMonthlyFromCalendar,
  computeWeekdayProfile,
  extractReviewTopics,
  rankCompetitors,
  readCalendar,
  selectPeers,
} from "./analytics";
import type {
  CalendarKpis,
  CalendarNight,
  CompetitorMatch,
  MarketPosition,
  MonthlyPoint,
  RevenueLeaderboardRow,
  ReviewAnalysis,
} from "./analytics";
import { buildInsights } from "./insights";
import { buildMarketNightIndex, computeMarketWeekdayProfile, roomRateSplit } from "./pricing";
import type { MarketNight, WeekdayMarketPoint } from "./pricing";
import type { Insight } from "./insights";
import {
  OWNER_ROOM_ID,
  findOwnerProfile,
  getLoadIssues,
  loadManualBlocks,
  loadRadarRooms,
  loadReviews,
  loadRevenueSnapshots,
  loadRoomProfiles,
  loadSweep,
} from "./load";
import type { LoadIssue, RevenueSnapshot, RoomProfile } from "./load";

export interface JajigaDataset {
  owner: RoomProfile;
  rooms: RoomProfile[];
  competitors: CompetitorMatch[];
  peers: CompetitorMatch[];
  market: MarketPosition;

  calendar: CalendarNight[];
  calendarKpis: CalendarKpis;
  /** Per-night median asking price across the tracked peer set. */
  marketNights: Map<string, MarketNight>;
  monthly: MonthlyPoint[];
  weekdayProfile: { day: string; occupancy: number; adr: number }[];
  /** Weekday demand across the tracked market, with the owner's price overlaid. */
  marketWeekday: WeekdayMarketPoint[];
  /** Observed weekday/weekend median rate per room id, from the radar feed. */
  rateSplits: Map<number, { weekday: number; weekend: number }>;
  /** The owner's real posted rate, which can differ from the card price. */
  ownerRate: { weekday: number; weekend: number } | null;
  /** The tracked market's real posted rate. */
  marketRate: { weekday: number; weekend: number } | null;

  revenueSnapshots: RevenueSnapshot[];
  leaderboard: RevenueLeaderboardRow[];
  realizedLeaderboard: RevenueLeaderboardRow[] | null;
  realizedRange: string | null;
  /** Length in nights of the realized window, when it can be derived. */
  realizedWindowNights: number | null;

  reviews: ReviewAnalysis | null;
  reviewTopics: ReturnType<typeof extractReviewTopics>;

  insights: Insight[];

  radarRoomCount: number;
  sweepCount: number;
  fetchedAt: string | null;
  today: string;
  issues: LoadIssue[];
  /** True when the real dataset could not be found at all. */
  isEmpty: boolean;
}

let cached: JajigaDataset | null = null;

/**
 * Build the whole view model once per process.
 *
 * The files are static exports refreshed out-of-band by the owner's pipeline,
 * so parsing ~10 MB of JSON on every request would be wasteful. `next dev`
 * reloads the module on change, and production restarts on deploy.
 */
export function getDataset(): JajigaDataset {
  if (cached) return cached;
  cached = buildDataset();
  return cached;
}

function buildDataset(): JajigaDataset {
  const rooms = loadRoomProfiles();
  const owner = findOwnerProfile(rooms);

  const today = toISO(new Date());

  if (!owner) {
    return emptyDataset(today);
  }

  /* ------------------------------ Competitors ----------------------------- */
  const competitors = rankCompetitors(owner, rooms);
  const peers = selectPeers(competitors);
  const market = computeMarketPosition(owner, peers);

  /* -------------------------------- Calendar ------------------------------ */
  const radarRooms = loadRadarRooms();
  const manualBlocks = loadManualBlocks();
  const ownerRadar = radarRooms.find((room) => room.room_id === OWNER_ROOM_ID) ?? null;

  const calendar = ownerRadar
    ? readCalendar(ownerRadar, manualBlocks.get(OWNER_ROOM_ID), today)
    : [];
  const calendarKpis = computeCalendarKpis(calendar);
  const monthly = computeMonthlyFromCalendar(calendar);
  const weekdayProfile = computeWeekdayProfile(calendar);

  // Radar covers 35 rooms; restrict the price index to rooms that are also in
  // the comparable peer set so the benchmark stays apples-to-apples. If the
  // overlap is too thin, fall back to every tracked room.
  const peerIds = new Set(peers.map((peer) => peer.id));
  const radarPeerOverlap = radarRooms.filter((room) => peerIds.has(room.room_id)).length;
  const radarFilter = radarPeerOverlap >= 6 ? peerIds : undefined;
  const marketNights = buildMarketNightIndex(radarRooms, radarFilter, OWNER_ROOM_ID);
  const rateSplits = new Map(
    radarRooms.map((room) => [room.room_id, roomRateSplit(room)] as const),
  );
  const marketWeekday = computeMarketWeekdayProfile(
    radarRooms,
    calendar,
    radarFilter,
    OWNER_ROOM_ID,
  );

  /* -------------------------------- Revenue ------------------------------- */
  const revenueSnapshots = loadRevenueSnapshots();
  const realized = revenueSnapshots.find((s) => s.file.startsWith("realized"));
  const projection =
    revenueSnapshots.find((s) => s.file.startsWith("past-revenue")) ?? revenueSnapshots[0];

  const leaderboard = projection ? buildRevenueLeaderboard(projection.rooms, OWNER_ROOM_ID) : [];
  const realizedLeaderboard = realized
    ? buildRevenueLeaderboard(realized.rooms, OWNER_ROOM_ID)
    : null;

  /* -------------------------------- Reviews ------------------------------- */
  const ownerReviews = loadReviews(OWNER_ROOM_ID);
  const reviews = ownerReviews.length ? analyzeReviews(ownerReviews) : null;
  const reviewTopics = extractReviewTopics(ownerReviews);

  /* ------------------------------- Insights ------------------------------- */
  const ownerRate = rateSplits.get(OWNER_ROOM_ID) ?? null;
  const marketRate = deriveMarketRate(marketWeekday);

  const insights = buildInsights({
    owner,
    market,
    calendar: calendarKpis,
    reviews,
    reviewTopics,
    leaderboard: realizedLeaderboard ?? leaderboard,
    peerCount: peers.length,
    ownerRate,
    marketRate,
  });

  return {
    owner,
    rooms,
    competitors,
    peers,
    market,

    calendar,
    calendarKpis,
    marketNights,
    monthly,
    weekdayProfile,
    marketWeekday,
    rateSplits,
    ownerRate,
    marketRate,

    revenueSnapshots,
    leaderboard,
    realizedLeaderboard,
    realizedRange: formatRealizedRange(realized?.range ?? null, realized?.rooms ?? []),
    realizedWindowNights: countRealizedWindow(realized?.rooms ?? []),

    reviews,
    reviewTopics,

    insights,

    radarRoomCount: radarRooms.length,
    sweepCount: loadSweep().length,
    fetchedAt: ownerRadar?.fetched_at ?? null,
    today,
    issues: getLoadIssues(),
    isEmpty: false,
  };
}

/**
 * Present the realized window as a clean Jalali range.
 *
 * The raw `realized_range` string mixes Gregorian ISO dates with a Jalali year
 * ("2026-08-07 تا 2026-08-12 ۱۴۰۵"), which is confusing in a Persian UI. When
 * the snapshot carries per-night data we derive the true bounds from it and
 * fall back to the raw string only if nothing better is available.
 */
function formatRealizedRange(raw: string | null, rooms: RevenueSnapshot["rooms"]): string | null {
  const dates = rooms
    .flatMap((room) => room.nights ?? [])
    .map((night) => night.date)
    .filter((date): date is string => typeof date === "string")
    .sort();

  if (dates.length) {
    const start = dates[0];
    const end = dates[dates.length - 1];
    return start === end
      ? toJalaliLong(start)
      : `${toJalaliLong(start)} تا ${toJalaliLong(end)}`;
  }

  const isoMatches = raw?.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches?.length === 2) {
    return `${toJalaliLong(isoMatches[0])} تا ${toJalaliLong(isoMatches[1])}`;
  }

  return raw;
}

/** Collapse the weekday profile into a single weekday/weekend market rate. */
function deriveMarketRate(
  profile: WeekdayMarketPoint[],
): { weekday: number; weekend: number } | null {
  const weekdayPrices = profile.slice(0, 4).map((p) => p.marketPrice).filter((p) => p > 0);
  const weekendPrices = profile.slice(4).map((p) => p.marketPrice).filter((p) => p > 0);
  if (!weekdayPrices.length || !weekendPrices.length) return null;

  const mid = (list: number[]) => {
    const sorted = [...list].sort((a, b) => a - b);
    const i = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[i] : Math.round((sorted[i - 1] + sorted[i]) / 2);
  };

  return { weekday: mid(weekdayPrices), weekend: mid(weekendPrices) };
}

/** Distinct nights covered by the realized snapshot. */
function countRealizedWindow(rooms: RevenueSnapshot["rooms"]): number | null {
  const dates = new Set(
    rooms.flatMap((room) => room.nights ?? []).map((night) => night.date),
  );
  return dates.size || null;
}

function emptyDataset(today: string): JajigaDataset {
  const placeholder: RoomProfile = {
    id: OWNER_ROOM_ID,
    title: "اقامتگاه یافت نشد",
    url: `https://www.jajiga.com/room/${OWNER_ROOM_ID}`,
    village: "—",
    isOwn: true,
    status: "missing",
    propertyType: "—",
    types: [],
    bedrooms: 0,
    floorArea: null,
    landArea: null,
    capacity: 0,
    maxCapacity: 0,
    beds: { double: 0, mattress: 0, single: 0, sofaBed: 0 },
    basePrice: 0,
    extraGuestFee: null,
    minStay: null,
    cancellationPolicy: null,
    discounts: [],
    currentDiscountPercent: 0,
    features: [],
    featureLabels: [],
    featureDescriptions: {},
    featuresCount: 0,
    badges: [],
    isPlus: false,
    isInstant: false,
    rating: null,
    reviewsCount: 0,
    successBooks: 0,
    subRatings: {
      accuracy: null,
      communication: null,
      cleanliness: null,
      location: null,
      checkin: null,
      value: null,
    },
    host: {
      id: null,
      name: null,
      acceptRate: null,
      responseTimeMinutes: null,
      communicationRate: null,
    },
    occupancy30: null,
    occupancy30Booked: 0,
    occupancy30Total: 0,
    geo: null,
    picturesCount: 0,
  };

  return {
    owner: placeholder,
    rooms: [],
    competitors: [],
    peers: [],
    market: {
      sampleSize: 0,
      medianPrice: 0,
      p25: 0,
      p75: 0,
      pricePercentile: 0,
      medianRating: 0,
      ratingPercentile: 0,
      medianReviews: 0,
      medianOccupancy: null,
      ownerOccupancy: null,
      missingFeatures: [],
      uniqueFeatures: [],
    },
    calendar: [],
    calendarKpis: computeCalendarKpis([]),
    marketNights: new Map(),
    monthly: [],
    weekdayProfile: [],
    marketWeekday: [],
    rateSplits: new Map(),
    ownerRate: null,
    marketRate: null,
    revenueSnapshots: [],
    leaderboard: [],
    realizedLeaderboard: null,
    realizedRange: null,
    realizedWindowNights: null,
    reviews: null,
    reviewTopics: [],
    insights: [],
    radarRoomCount: 0,
    sweepCount: 0,
    fetchedAt: null,
    today,
    issues: getLoadIssues(),
    isEmpty: true,
  };
}
