/**
 * Reviews dashboard analytics — a TypeScript port of the analytics section
 * of the pipeline's `build_reviews_dashboard.py` (jajiga-tracker), so the
 * MizbanYar /reviews page can run the same logic inline on any room whose
 * reviews exist in `data/reviews/`.
 *
 * All functions are pure: input is the review array (+ an ISO "today" where
 * needed), output is plain JSON — testable with node:test, no IO.
 */
import { jalaliParts } from "../dates";
import type { Review } from "./schemas";

export interface ReviewKeyword {
  word: string;
  count: number;
}

export interface ReviewThemeSample {
  text: string;
  rating: number | null;
  name: string | null;
  date: string;
}

export interface ReviewTheme {
  key: string;
  title: string;
  desc: string;
  /** First proof word — used to jump to the filtered table. */
  word: string;
  count: number;
  samples: ReviewThemeSample[];
}

export type FunTag = "بامزه" | "انتقادی" | "احساسی" | "مفصل";

export interface FunComment {
  text: string;
  rating: number | null;
  name: string | null;
  date: string;
  tag: FunTag;
}

export interface ReviewLastYear {
  average: number | null;
  count: number;
}

export interface RepeatUser {
  name: string;
  count: number;
  years: number[];
}

export interface ReviewTimelinePoint {
  /** Jalali month key `1404-05` — sortable. */
  key: string;
  /** e.g. `مرداد ۰۵` (ASCII two-digit year inside is intentional). */
  label: string;
  count: number;
  average: number;
}

export interface ReviewDashboardAnalytics {
  keywords: ReviewKeyword[];
  themes: ReviewTheme[];
  fun: FunComment[];
  lastYear: ReviewLastYear | null;
  uniqueUsers: number;
  repeatUsers: RepeatUser[];
  fiveStar: number;
  belowFive: number;
  replied: number;
  /** Distinct Jalali years of the reviews, newest first. */
  years: number[];
  timeline: ReviewTimelinePoint[];
  /** Raw ratings keyed by integer bucket 1..5 (floor-half rounding like the pipeline). */
  buckets: { stars: number; count: number }[];
}

const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/* ------------------------- curated word dictionaries ------------------------ */
/* Same lists as build_reviews_dashboard.py — keep in sync when extending. */

const CURATED_KW = [
  "استخر", "جکوزی", "تمیز", "میزبان", "برخورد", "منظره", "طبیعت",
  "جاده", "سکوت", "گرون", "ارزان", "پیشنهاد", "آب گرم", "خوش",
  "متشکر", "تجربه",
];

const STOPWORDS = new Set([
  "و", "که", "از", "با", "به", "این", "آن", "بود", "است", "شد",
  "ما", "من", "شما", "هم", "برای", "در", "را", "تا", "همه", "بسیار",
  "بعد", "قبل", "میکنیم", "کرد", "کردم", "کردند", "می", "روی", "شب",
  "روز", "بار", "بارها", "رفتم", "رفتیم", "خودش", "خانه", "اقامتگاه",
  "ویلا", "کلبه", "جا", "جای", "بودن", "داره", "هست", "هستم",
]);

interface ThemeDef {
  key: string;
  title: string;
  desc: string;
  words: string[];
}

/**
 * Unique-style themes: every theme = a distinctive trait + words that prove
 * it. A theme only appears when reviews actually mention its words, so the
 * list is safe to share across different cabins.
 */
const THEMES: ThemeDef[] = [
  {
    key: "gen", title: "ژنراتور برق — قطعی برق ممنوع",
    desc: "در بی‌برقی‌های سراسری، اقامتگاه برق دارد",
    words: ["ژنراتور", "موتور برق", "برق نداره", "قطعی برق", "قطع برق",
      "بی‌برقی", "برق می‌رفت", "برق رفته"],
  },
  {
    key: "pool", title: "استخر آب گرم روباز",
    desc: "استخر تمیز با آب گرم، حتی در سرمای زمستان",
    words: ["استخر", "آب داغ", "آب گرم"],
  },
  {
    key: "view", title: "ویوی دریا + جنگل + کوه",
    desc: "چشم‌انداز بی‌نظیر از بالکن و استخر",
    words: ["ویو", "ویوی", "منظره", "چشم‌انداز", "چشم انداز", "دریا", "جنگل"],
  },
  {
    key: "garden", title: "باغ میوه و فضای سبز",
    desc: "مهمان‌ها از میوه‌های باغ استفاده می‌کنند",
    words: ["پرتقال", "نارنج", "مرکبات", "باغ"],
  },
  {
    key: "cats", title: "گربه‌های دمِ در",
    desc: "گربه‌های باغ که منتظر مهمان‌ها هستند",
    words: ["گربه", "گربه‌ها", "گربه ها"],
  },
  {
    key: "host", title: "میزبانی حرفه‌ای و پیگیر",
    desc: "پاسخ‌گویی سریع، حتی نیمه‌شب",
    words: ["میزبان", "مالک", "صاحب"],
  },
  {
    key: "hotel", title: "جزئیات هتلی",
    desc: "ملافه‌های سفید هتلی + پک بهداشتی",
    words: ["ملافه", "پک بهداشتی", "هتلی", "اسکاج"],
  },
  {
    key: "loyal", title: "مشتریان وفادار",
    desc: "مهمان‌هایی که بارها برمی‌گردند",
    words: ["باز هم", "بار دوم", "بار سوم", "بار چهارم", "دوبار", "دو بار",
      "پاتوق", "دوباره رزرو", "بازم میام", "باز میام", "دوباره این"],
  },
  {
    key: "road", title: "دسترسی: جادهٔ خاکی",
    desc: "تنها نکتهٔ خاکی مسیر",
    words: ["جاده", "خاکی", "مسیر", "آسفالت"],
  },
];

const FUN_MARKERS = [
  "نمره 20", "نمره ۲۰", "هزار ویلا", "پاتوق", "گربه", "موریانه",
  "کلاس آموزشی", "20 میدم", "۲۰ میدم", "شاهکار", "بهترین ویلای",
  "می‌خند", "😂", "خنده", "پشیمون", "پشیمان", "امتیاز کامل دادم",
  "زیبا گزارش", "جون میده",
];

const EMOJI_SENTIMENT = "😂😍🙏❤️👌🤣🌿✨😅";

/* --------------------------------- helpers -------------------------------- */

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

function ratingOf(review: Review): number {
  return typeof review.rating === "number" && review.rating > 0 ? review.rating : 0;
}

function nameOf(review: Review): string | null {
  return review.user?.name?.trim() ? review.user.name : null;
}

/**
 * Jalali year of a review date, or null when the timestamp is unparseable.
 * ALWAYS slice the ISO string to its date part first: the pipeline timestamps
 * carry microseconds (`...T20:30:00.000000Z`) which date-fns' parseISO
 * rejects, while the bare date (`2026-06-01`) parses fine.
 */
function jalaliYearOf(iso: string): number | null {
  try {
    return jalaliParts(iso.slice(0, 10)).year;
  } catch {
    return null;
  }
}

/* -------------------------------- keywords -------------------------------- */

export function extractReviewKeywords(reviews: Review[]): ReviewKeyword[] {
  const texts = reviews.map((r) => r.content ?? "").join(" ");

  const counts = new Map<string, number>();
  for (const word of CURATED_KW) {
    // Substring occurrences, like the pipeline.
    const hits = texts.split(word).length - 1;
    if (hits >= 1) counts.set(word, hits);
  }

  const tokens = new Map<string, number>();
  for (const token of texts.split(/\s+/)) {
    if (token.length <= 2 || STOPWORDS.has(token)) continue;
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  const auto = [...tokens.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [word, c] of auto) {
    counts.set(word, Math.max(counts.get(word) ?? 0, c));
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([word, count]) => ({ word, count }));
}

/* ---------------------------------- themes -------------------------------- */

/** Prefer short, complete, five-star quotes as the visible proof. */
function sampleScore(review: Review): number {
  const c = (review.content ?? "").trim();
  const length = c.length;
  if (length < 40 || length > 260) return 0;
  return (ratingOf(review) === 5 ? 10 : 4) - Math.abs(length - 150) / 45;
}

export function buildReviewThemes(reviews: Review[]): ReviewTheme[] {
  const themes: ReviewTheme[] = [];
  for (const def of THEMES) {
    const hit = reviews.filter((r) =>
      def.words.some((word) => (r.content ?? "").includes(word)),
    );
    if (!hit.length) continue;
    const samples = [...hit]
      .sort((a, b) => sampleScore(b) - sampleScore(a))
      .slice(0, 3)
      .map((r) => ({
        text: (r.content ?? "").trim().slice(0, 260),
        rating: typeof r.rating === "number" ? r.rating : null,
        name: nameOf(r),
        date: r.created_at.slice(0, 10),
      }));
    themes.push({
      key: def.key,
      title: def.title,
      desc: def.desc,
      word: def.words[0],
      count: hit.length,
      samples,
    });
  }
  return themes;
}

/* ------------------------------- fun comments ------------------------------ */

export function buildFunComments(reviews: Review[]): FunComment[] {
  const raw: { text: string; rating: number | null; name: string | null; date: string; tags: FunTag[] }[] = [];
  for (const review of reviews) {
    const c = (review.content ?? "").trim();
    if (!c) continue;
    const tags: FunTag[] = [];
    const rating = ratingOf(review);
    if (rating > 0 && rating <= 3) tags.push("انتقادی");
    if ([...EMOJI_SENTIMENT].some((ch) => c.includes(ch))) tags.push("احساسی");
    if (c.length >= 220) tags.push("مفصل");
    if (FUN_MARKERS.some((m) => c.includes(m))) tags.push("بامزه");
    if (!tags.length) continue;
    raw.push({
      text: c,
      rating: typeof review.rating === "number" ? review.rating : null,
      name: nameOf(review),
      date: review.created_at.slice(0, 10),
      tags,
    });
  }

  const priority: FunTag[] = ["بامزه", "انتقادی", "احساسی", "مفصل"];
  const out: FunComment[] = [];
  const seen = new Set<string>();
  for (const tag of priority) {
    let picked = 0;
    for (const item of raw) {
      if (out.length >= 8) break;
      if (item.tags.includes(tag) && !seen.has(item.text)) {
        out.push({ text: item.text.slice(0, 280), rating: item.rating, name: item.name, date: item.date, tag });
        seen.add(item.text);
        picked += 1;
      }
      if (picked >= 2) break;
    }
    if (out.length >= 8) break;
  }
  return out;
}

/* ------------------------------ last-year stats ----------------------------- */
/* Jajiga's displayed rating = average of the last 12 months only — this is   */
/* the number guests actually see on the listing card.                         */

export function reviewLastYearStats(
  reviews: Review[],
  todayISO: string,
): ReviewLastYear | null {
  const today = new Date(todayISO.slice(0, 10) + "T00:00:00");
  const cutoff = new Date(today);
  cutoff.setFullYear(today.getFullYear() - 1);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const ratings = reviews
    .filter((r) => r.created_at.slice(0, 10) >= cutoffISO)
    .map(ratingOf)
    .filter((r) => r > 0);

  return { average: mean(ratings), count: ratings.length };
}

/* ----------------------------- users & buckets ----------------------------- */

export function repeatUsers(reviews: Review[]): RepeatUser[] {
  const byUser = new Map<number, Review[]>();
  for (const review of reviews) {
    const id = review.user?.id;
    if (typeof id !== "number") continue;
    const list = byUser.get(id) ?? [];
    list.push(review);
    byUser.set(id, list);
  }
  return [...byUser.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([id, list]) => ({
      name: nameOf(list[0]) ?? `کاربر ${id}`,
      count: list.length,
      years: [
        ...new Set(
          list
            .map((r) => jalaliYearOf(r.created_at))
            .filter((y): y is number => y !== null),
        ),
      ].sort((a, b) => a - b),
    }));
}

export function reviewBuckets(reviews: Review[]): { stars: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const review of reviews) {
    const r = ratingOf(review);
    if (r <= 0) continue;
    const bucket = Math.floor(r + 0.5); // 4.8/4.5 → 5 ; 4.2/4.0 → 4 ; 3.7 → 4
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 }));
}

/* -------------------------------- timeline --------------------------------- */

export function buildReviewTimeline(reviews: Review[]): ReviewTimelinePoint[] {
  const byMonth = new Map<string, number[]>();
  for (const review of reviews) {
    const r = ratingOf(review);
    if (r <= 0) continue;
    const year = jalaliYearOf(review.created_at);
    if (year === null) continue;
    const { month } = jalaliParts(review.created_at.slice(0, 10));
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const bucket = byMonth.get(key) ?? [];
    bucket.push(r);
    byMonth.set(key, bucket);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({
      key,
      label: `${JALALI_MONTHS[Number(key.slice(5)) - 1]} ${String(Number(key.slice(0, 4)) % 100).padStart(2, "0")}`,
      count: values.length,
      average: mean(values) ?? 0,
    }));
}

/* ---------------------------------- main ----------------------------------- */

export function analyzeReviewDashboard(
  reviews: Review[],
  todayISO: string,
): ReviewDashboardAnalytics {
  const rated = reviews.filter((r) => ratingOf(r) > 0);
  const fiveStar = rated.filter((r) => (r.rating as number) === 5).length;

  return {
    keywords: extractReviewKeywords(reviews),
    themes: buildReviewThemes(reviews),
    fun: buildFunComments(reviews),
    lastYear: reviewLastYearStats(reviews, todayISO),
    uniqueUsers: new Set(reviews.map((r) => r.user?.id ?? null)).size,
    repeatUsers: repeatUsers(reviews),
    fiveStar,
    belowFive: rated.length - fiveStar,
    replied: reviews.filter((r) => r.host_reply?.content).length,
    years: [
      ...new Set(
        reviews
          .map((r) => jalaliYearOf(r.created_at))
          .filter((y): y is number => y !== null),
      ),
    ].sort((a, b) => b - a),
    timeline: buildReviewTimeline(reviews),
    buckets: reviewBuckets(reviews),
  };
}
