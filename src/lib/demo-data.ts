import { addDays, demandSeason, holidayName, isWeekendNight, toISO } from "./dates";
import type {
  BlockedNight,
  Competitor,
  DailyPrice,
  DailyViews,
  Expense,
  Property,
  Reservation,
} from "./types";

/**
 * Deterministic fictional Babolkenar dataset.
 *
 * The numbers are shaped after the public baseline in
 * `docs/residence-baseline.md`, but every reservation, expense and view count
 * here is invented. The UI must always label this as داده نمایشی.
 *
 * A seeded PRNG keeps server and client renders identical (no hydration drift)
 * and makes the demo reproducible between runs.
 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo timeline: the 12 Jalali months ending with the current one. */
export const DEMO_TODAY = "2026-08-17";
export const DEMO_START = "2025-08-23"; // ابتدای شهریور ۱۴۰۴
export const DEMO_END = "2026-09-21"; // پایان شهریور ۱۴۰۵

export const demoProperty: Property = {
  id: "host-3297585",
  title: "کلبه سوئیسی در بابلکنار - سیدکلا",
  listingCode: "3297585",
  url: "https://www.jajiga.com/room/3297585",
  area: "سیدکلا",
  city: "بابلکنار",
  province: "مازندران",
  propertyType: "کلبه دربست",
  capacity: 4,
  extraCapacity: 2,
  bedrooms: 1,
  builtAreaM2: 100,
  landAreaM2: 200,
  amenities: [
    "پارکینگ",
    "سیستم گرمایشی",
    "سیستم سرمایشی",
    "تلویزیون",
    "مبلمان",
    "آب لوله‌کشی",
    "استخر",
    "جکوزی",
    "چشم‌انداز",
    "حیاط اختصاصی",
    "رزرو فوری",
    "آشپزخانه",
    "یخچال",
    "ماشین لباسشویی",
    "اینترنت",
    "کپسول آتش‌نشانی",
    "تراس",
  ],
  basePrice: 2_400_000,
  weekendPrice: 3_650_000,
  extraGuestFee: 750_000,
  rating: 5,
  reviewsCount: 9,
  ratingBreakdown: {
    accuracy: 5,
    hostBehavior: 5,
    cleanliness: 5,
    location: 5,
    handover: 5,
    valueForMoney: 4.8,
  },
};

/** Nightly list price used by the demo host, before any stay discount. */
function demoListPrice(date: string): number {
  const season = demandSeason(date);
  const weekend = isWeekendNight(date);
  const holiday = holidayName(date);

  let price = demoProperty.basePrice;
  if (weekend) price = demoProperty.weekendPrice ?? price;
  if (season === "high") price *= 1.12;
  if (season === "low") price *= 0.88;
  if (holiday) price *= 1.15;

  return Math.round(price / 50_000) * 50_000;
}

export function buildDemoDailyPrices(): DailyPrice[] {
  const prices: DailyPrice[] = [];
  let cursor = DEMO_START;
  while (cursor <= DEMO_END) {
    prices.push({ date: cursor, price: demoListPrice(cursor) });
    cursor = addDays(cursor, 1);
  }
  return prices;
}

/**
 * Walk the timeline and book stays with a probability driven by season and
 * weekend demand, so the resulting occupancy curve looks like a real northern
 * Iran cabin: packed in نوروز and تابستان, quiet in دی/بهمن.
 */
export function buildDemoReservations(): {
  reservations: Reservation[];
  blockedNights: BlockedNight[];
} {
  const random = mulberry32(3297585);
  const reservations: Reservation[] = [];
  const blockedNights: BlockedNight[] = [];

  let cursor = DEMO_START;
  let index = 1;

  while (cursor < DEMO_END) {
    const season = demandSeason(cursor);
    const weekend = isWeekendNight(cursor);
    const holiday = holidayName(cursor);

    let bookingChance = season === "high" ? 0.62 : season === "mid" ? 0.42 : 0.24;
    if (weekend) bookingChance += 0.22;
    if (holiday) bookingChance += 0.15;

    // Maintenance/personal blocks: a short winter closure and random days off.
    if (random() < 0.035) {
      const blockLength = 1 + Math.floor(random() * 2);
      for (let i = 0; i < blockLength; i += 1) {
        blockedNights.push({
          date: addDays(cursor, i),
          reason: random() < 0.5 ? "maintenance" : "personal",
          note: "نمونه — شب مسدودشده توسط میزبان",
        });
      }
      cursor = addDays(cursor, blockLength);
      continue;
    }

    if (random() < bookingChance) {
      // Weekend stays are short; summer and Nowruz stays run longer.
      const roll = random();
      let nights = weekend ? 2 : 1;
      if (season === "high") nights = roll < 0.35 ? 2 : roll < 0.75 ? 3 : 5;
      else if (season === "mid") nights = roll < 0.6 ? 2 : 3;
      else nights = roll < 0.7 ? 1 : 2;

      const checkIn = cursor;
      const checkOut = addDays(cursor, nights);
      if (checkOut > DEMO_END) break;

      let gross = 0;
      for (let i = 0; i < nights; i += 1) gross += demoListPrice(addDays(checkIn, i));

      const guests = 2 + Math.floor(random() * 4); // 2..5
      if (guests > demoProperty.capacity) {
        gross += (guests - demoProperty.capacity) * (demoProperty.extraGuestFee ?? 0) * nights;
      }

      // Length-of-stay discounts declared on the public listing.
      let discount = 0;
      if (nights >= 15) discount = gross * 0.2;
      else if (nights >= 6) discount = gross * 0.1;
      gross -= discount;

      gross = Math.round(gross / 10_000) * 10_000;

      const cancelled = random() < 0.07;
      const status: Reservation["status"] = cancelled
        ? "cancelled"
        : checkIn > DEMO_TODAY
          ? "upcoming"
          : "completed";

      reservations.push({
        id: `demo-res-${index}`,
        checkIn,
        checkOut,
        guests,
        status,
        grossAmount: gross,
        platformFee: Math.round(gross * 0.11),
        discount: Math.round(discount),
        refund: cancelled ? Math.round(gross * 0.8) : 0,
        note: "نمونه",
      });

      index += 1;
      // Turnover gap between stays.
      cursor = addDays(checkOut, random() < 0.55 ? 0 : 1);
      continue;
    }

    cursor = addDays(cursor, 1);
  }

  return { reservations, blockedNights };
}

export function buildDemoExpenses(): Expense[] {
  const random = mulberry32(88_1404);
  const expenses: Expense[] = [];
  const categories: [string, number, number][] = [
    ["نظافت و خدمات", 900_000, 2_400_000],
    ["قبوض و انرژی", 600_000, 1_800_000],
    ["تعمیر و نگهداری", 400_000, 3_000_000],
    ["ملزومات مهمان", 300_000, 1_200_000],
  ];

  let cursor = DEMO_START;
  let id = 1;
  while (cursor <= DEMO_END) {
    for (const [category, min, max] of categories) {
      if (random() < 0.85) {
        expenses.push({
          id: `demo-exp-${id}`,
          date: addDays(cursor, Math.floor(random() * 25)),
          category,
          amount: Math.round((min + random() * (max - min)) / 10_000) * 10_000,
          note: "نمونه",
        });
        id += 1;
      }
    }
    cursor = addDays(cursor, 30);
  }

  return expenses.filter((e) => e.date <= DEMO_END).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDemoViews(): DailyViews[] {
  const random = mulberry32(777);
  const views: DailyViews[] = [];
  let cursor = DEMO_START;

  while (cursor <= DEMO_END) {
    const season = demandSeason(cursor);
    const base = season === "high" ? 78 : season === "mid" ? 46 : 27;
    const weekendBoost = isWeekendNight(cursor) ? 1.25 : 1;
    const count = Math.round(base * weekendBoost * (0.7 + random() * 0.6));
    views.push({
      date: cursor,
      views: count,
      inquiries: Math.round(count * (0.04 + random() * 0.05)),
    });
    cursor = addDays(cursor, 1);
  }

  return views;
}

/**
 * Fictional competitors seeded from the areas Jajiga publicly recommends next
 * to the baseline listing. Prices and ratings are invented demo values.
 */
export const demoCompetitors: Competitor[] = [
  {
    id: "demo-c1",
    title: "ویلا استخردار بابلکنار - بالفکلا",
    area: "بابلکنار — بالفکلا شرقی",
    distanceKm: 4.5,
    propertyType: "ویلا دربست",
    capacity: 6,
    bedrooms: 2,
    builtAreaM2: 60,
    weekdayPrice: 2_500_000,
    weekendPrice: 3_400_000,
    rating: 4.8,
    reviewsCount: 7,
    amenities: ["پارکینگ", "استخر", "سیستم گرمایشی", "تلویزیون", "آشپزخانه", "حیاط اختصاصی", "اینترنت"],
    unavailableShare: 0.47,
  },
  {
    id: "demo-c2",
    title: "کلبه چوبی کبریاکلا",
    area: "بابلکنار — کبریاکلا",
    distanceKm: 6.2,
    propertyType: "کلبه دربست",
    capacity: 6,
    bedrooms: 1,
    builtAreaM2: 75,
    weekdayPrice: 3_200_000,
    weekendPrice: 4_100_000,
    rating: 4.9,
    reviewsCount: 9,
    amenities: [
      "پارکینگ",
      "جکوزی",
      "سیستم گرمایشی",
      "سیستم سرمایشی",
      "چشم‌انداز",
      "آشپزخانه",
      "اینترنت",
      "آتشدان",
    ],
    unavailableShare: 0.53,
  },
  {
    id: "demo-c3",
    title: "سوئیت جنگلی کلیج‌خیل",
    area: "شیرگاه — کلیج‌خیل",
    distanceKm: 22,
    propertyType: "سوئیت",
    capacity: 5,
    bedrooms: 1,
    builtAreaM2: 75,
    weekdayPrice: 2_400_000,
    weekendPrice: 3_000_000,
    rating: 4.9,
    reviewsCount: 42,
    amenities: ["پارکینگ", "سیستم گرمایشی", "تلویزیون", "آشپزخانه", "چشم‌انداز", "آتشدان", "اینترنت"],
    unavailableShare: 0.61,
  },
  {
    id: "demo-c4",
    title: "ویلا لوکس لفور",
    area: "لفور — شهرقلعه",
    distanceKm: 28,
    propertyType: "ویلا دربست",
    capacity: 6,
    bedrooms: 1,
    builtAreaM2: 80,
    weekdayPrice: 4_500_000,
    weekendPrice: 5_800_000,
    rating: 4.7,
    reviewsCount: 15,
    amenities: [
      "پارکینگ",
      "استخر",
      "جکوزی",
      "سیستم گرمایشی",
      "سیستم سرمایشی",
      "چشم‌انداز",
      "آشپزخانه",
      "اینترنت",
      "آتشدان",
      "بیلیارد",
    ],
    unavailableShare: 0.38,
  },
  {
    id: "demo-c5",
    title: "کلبه ییلاقی سیدکلا",
    area: "بابلکنار — سیدکلا",
    distanceKm: 1.2,
    propertyType: "کلبه دربست",
    capacity: 4,
    bedrooms: 1,
    builtAreaM2: 85,
    weekdayPrice: 2_200_000,
    weekendPrice: 3_100_000,
    rating: 4.6,
    reviewsCount: 23,
    amenities: ["پارکینگ", "سیستم گرمایشی", "تلویزیون", "آشپزخانه", "چشم‌انداز", "حیاط اختصاصی"],
    unavailableShare: 0.44,
  },
  {
    id: "demo-c6",
    title: "اقامتگاه سنتی بابل - گنج‌افروز",
    area: "بابل — گنج‌افروز",
    distanceKm: 13,
    propertyType: "اقامتگاه بومگردی",
    capacity: 5,
    bedrooms: 2,
    builtAreaM2: 90,
    weekdayPrice: 1_800_000,
    weekendPrice: 2_300_000,
    rating: 4.5,
    reviewsCount: 31,
    amenities: ["پارکینگ", "سیستم گرمایشی", "آشپزخانه", "حیاط اختصاصی", "صبحانه"],
    unavailableShare: 0.35,
  },
  {
    id: "demo-c7",
    title: "ویلا استخر سرپوشیده بابلکنار",
    area: "بابلکنار — درازکلا",
    distanceKm: 7.8,
    propertyType: "ویلا دربست",
    capacity: 8,
    bedrooms: 2,
    builtAreaM2: 120,
    weekdayPrice: 4_200_000,
    weekendPrice: 5_500_000,
    rating: 4.8,
    reviewsCount: 18,
    amenities: [
      "پارکینگ",
      "استخر",
      "جکوزی",
      "سیستم گرمایشی",
      "سیستم سرمایشی",
      "تلویزیون",
      "آشپزخانه",
      "اینترنت",
      "آتشدان",
      "توری پنجره",
    ],
    unavailableShare: 0.5,
  },
  {
    id: "demo-c8",
    title: "کلبه دنج امیرکلا",
    area: "امیرکلا",
    distanceKm: 17,
    propertyType: "کلبه دربست",
    capacity: 4,
    bedrooms: 1,
    builtAreaM2: 65,
    weekdayPrice: 1_950_000,
    weekendPrice: 2_600_000,
    rating: 4.4,
    reviewsCount: 12,
    amenities: ["پارکینگ", "سیستم گرمایشی", "تلویزیون", "آشپزخانه", "اینترنت", "توری پنجره"],
    unavailableShare: 0.29,
  },
  {
    id: "demo-c9",
    title: "ویلا جنگلی کتالم",
    area: "بابلکنار — کتالم",
    distanceKm: 9.4,
    propertyType: "ویلا دربست",
    capacity: 6,
    bedrooms: 2,
    builtAreaM2: 95,
    weekdayPrice: 3_000_000,
    weekendPrice: 3_900_000,
    rating: 4.7,
    reviewsCount: 26,
    amenities: [
      "پارکینگ",
      "استخر",
      "سیستم گرمایشی",
      "سیستم سرمایشی",
      "چشم‌انداز",
      "آشپزخانه",
      "اینترنت",
      "آتشدان",
      "توری پنجره",
    ],
    unavailableShare: 0.55,
  },
  {
    id: "demo-c10",
    title: "سوئیت نوساز بابلکنار",
    area: "بابلکنار — مرکزی",
    distanceKm: 3.1,
    propertyType: "سوئیت",
    capacity: 3,
    bedrooms: 1,
    builtAreaM2: 45,
    weekdayPrice: 1_500_000,
    weekendPrice: 1_900_000,
    rating: 4.3,
    reviewsCount: 8,
    amenities: ["پارکینگ", "سیستم گرمایشی", "تلویزیون", "آشپزخانه", "اینترنت"],
    unavailableShare: 0.31,
  },
];

export function buildDemoDataset() {
  const { reservations, blockedNights } = buildDemoReservations();
  return {
    property: demoProperty,
    reservations,
    blockedNights,
    expenses: buildDemoExpenses(),
    dailyPrices: buildDemoDailyPrices(),
    views: buildDemoViews(),
    competitors: demoCompetitors,
    range: { start: DEMO_START, end: DEMO_END },
    today: DEMO_TODAY,
  };
}

export const TODAY_ISO = toISO(new Date());
