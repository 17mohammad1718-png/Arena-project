import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeReviewDashboard,
  buildFunComments,
  buildReviewThemes,
  extractReviewKeywords,
  reviewLastYearStats,
} from "../src/lib/jajiga/reviewAnalytics";
import type { Review } from "../src/lib/jajiga/schemas";

const TODAY = "2026-08-17";

function review(overrides: Partial<Review> & { id: number; created_at: string; content: string }): Review {
  return {
    rating: 5,
    user: { id: 99, name: "مهمان" },
    host_reply: null,
    ...overrides,
  };
}

/* ------------------------------ fixture (10 reviews) ----------------------- */

const FIXTURE: Review[] = [
  review({
    id: 1,
    created_at: "2026-08-01",
    content:
      "استخر آب گرم خیلی تمیز بود. دید فوق العاده به جنگل و طبیعت داشت. میزبان خیلی مهمان نواز و پیگیر بود.",
    rating: 5,
    user: { id: 1, name: "مهدی" },
    host_reply: { content: "ممنون از حضورتان", created_at: "2026-08-02" },
  }),
  review({
    id: 2,
    created_at: "2026-07-10",
    content: "فقط جاده آخرش خاکی بود و کمی شیب داشت، ولی بقیه چیز عالی بود.",
    rating: 4.8,
    user: { id: 1, name: "مهدی" }, // repeat user
  }),
  review({
    id: 3,
    created_at: "2026-06-20",
    content: "بازم میام حتما 😍 حیف که مدت اقامتمون کوتاه بود.",
    rating: 5,
    user: { id: 2, name: "سارا" },
  }),
  review({
    id: 4,
    created_at: "2026-05-15",
    content: "پشیمون شدیم، انتظار بیشتری داشتیم. آب گرم نبود و اینجا نمره 20 نمیدم.",
    rating: 2,
    user: { id: 3, name: "علی" },
  }),
  review({
    id: 5,
    created_at: "2026-04-11",
    content:
      "همه چیز فوق العاده بود و ما خیلی راضی بودیم. محیط آرام و دنج بود و کولر و بخاری هر دو کار می‌کردند. از صبحانه گرفته تا امکانات بربر، همه چیز عالی بود. پذیرایی گرم میزبان باعث شد دوباره این اقامتگاه را به دوستان پیشنهاد کنیم و حتما برای تعطیلات بعدی دوباره رزرو می‌کنیم. تجربه‌ای که ارزش تکرار را دارد و هیچ نقطه ضعفی نداشت.",
    rating: 5,
    user: { id: 4, name: "رضا" },
  }),
  review({
    id: 6,
    created_at: "2026-03-08",
    content: "باتشکر از آقای صاحب خانه، همه چیز تمیز و مرتب بود.",
    rating: 5,
    user: { id: 5, name: "مریم" },
  }),
  review({
    id: 7,
    created_at: "2025-09-22",
    content: "فقط یه روز موندیم ولی خیلی خوب بود.",
    rating: 5,
    user: { id: 6, name: "حسین" },
  }),
  review({
    id: 8,
    created_at: "2024-01-10", // outside the last-12-month window
    content: "سال گذشته اومده بودیم، خوب بود.",
    rating: 4,
    user: { id: 7, name: "قدیمی" },
  }),
  review({
    id: 9,
    created_at: "2025-11-01",
    content: "بد بود، حشرات زیاد بود و آب شرب نبود.",
    rating: 2,
    user: { id: 8, name: "ناراضی" },
    host_reply: { content: "بابت این تجربه متاسفیم، در حال رفع مشکلات هستیم", created_at: "2025-11-03" },
  }),
  review({ id: 10, created_at: "2025-10-15", content: "اقامت معمولی بود.", rating: 3, user: { id: 9 } }),
];

/* --------------------------------- keywords -------------------------------- */

test("keywords keep curated words and drop stopwords", () => {
  const keywords = extractReviewKeywords(FIXTURE);
  const byWord = new Map(keywords.map((k) => [k.word, k.count]));

  assert.ok(byWord.has("استخر"), "curated word استخر should be present");
  assert.ok(byWord.has("جاده"), "curated word جاده should be present");
  assert.ok(byWord.get("استخر")! >= 1);
  // sorted descending
  const counts = keywords.map((k) => k.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  // no single-letter stopword noise
  for (const keyword of keywords) assert.ok(keyword.word.length > 2);
});

/* ---------------------------------- themes --------------------------------- */

test("themes detect proven traits with quotes", () => {
  const themes = buildReviewThemes(FIXTURE);
  const byKey = new Map(themes.map((t) => [t.key, t]));

  assert.ok(byKey.has("pool"), "استخر theme should fire");
  assert.ok(byKey.has("view"), "ویو theme should fire");
  assert.ok(byKey.has("host"), "میزبان theme should fire");
  assert.ok(byKey.has("road"), "جاده theme should fire");
  assert.ok(byKey.has("loyal"), "باز هم theme should fire");
  assert.equal(byKey.get("loyal")!.count, 2); // «بازم میام» (id 3) + «دوباره این اقامتگاه» (id 5)

  const pool = byKey.get("pool")!;
  assert.ok(pool.samples.length >= 1 && pool.samples.length <= 3);
  assert.ok(pool.samples.every((s) => s.text.length > 0));
  // sample metadata carries the guest identity
  assert.equal(pool.samples[0].name, "مهدی");
});

test("themes stay empty on reviews that mention nothing", () => {
  const empty = review({ id: 100, created_at: "2026-08-01", content: "چیز خاصی نبود" });
  assert.equal(buildReviewThemes([empty]).length, 0);
});

/* ------------------------------- fun comments ------------------------------ */

test("fun comments pick by priority: بامزه before انتقادی, max 2 per tag", () => {
  const fun = buildFunComments(FIXTURE);
  const tags = fun.map((f) => f.tag);

  // review 4 (بامزه + انتقادی) must be tagged with the higher priority tag
  const found = fun.find((f) => f.text.includes("نمره 20"));
  assert.ok(found, "بامزه marker comment should be picked");
  assert.equal(found!.tag, "بامزه");

  assert.ok(tags.includes("احساسی"), "emoji comment should be tagged احساسی");
  assert.ok(tags.includes("مفصل"), "long review should be tagged مفصل");
  assert.ok(tags.includes("انتقادی"), "critical review should be tagged انتقادی");

  const perTag = tags.reduce<Record<string, number>>((acc, tag) => {
    acc[tag] = (acc[tag] ?? 0) + 1;
    return acc;
  }, {});
  for (const count of Object.values(perTag)) assert.ok(count <= 2, "at most 2 per tag");
  assert.ok(fun.length <= 8);
});

/* ------------------------------- last-year stats --------------------------- */

test("last year stats only count reviews inside the 12-month window", () => {
  const stats = reviewLastYearStats(FIXTURE, TODAY);
  assert.ok(stats, "stats should exist");
  // window = 2025-08-17 .. 2026-08-17 → excludes id 8 (2024-01-10)
  assert.equal(stats!.count, FIXTURE.length - 1);
  // average over 9 ratings: 5,4.8,5,2,5,5,5,2,3 = 36.8/9
  assert.equal(stats!.average, Number((36.8 / 9).toFixed(2)));
});

/* ------------------------------- repeat users ------------------------------ */

test("repeat users are grouped by user id with distinct years", () => {
  const analytics = analyzeReviewDashboard(FIXTURE, TODAY);
  const mehdi = analytics.repeatUsers.find((u) => u.name === "مهدی");
  assert.ok(mehdi, "مهدی has two reviews");
  assert.equal(mehdi!.count, 2);
  // 2026-08 and 2026-07 are both Jalali 1405 → one distinct year
  assert.deepEqual(mehdi!.years, [1405]);
});

/* --------------------------------- timeline -------------------------------- */

test("timeline is sorted by Jalali month key with Persian labels", () => {
  const analytics = analyzeReviewDashboard(FIXTURE, TODAY);
  const keys = analytics.timeline.map((t) => t.key);
  assert.deepEqual(keys, [...keys].sort());

  const mordad = analytics.timeline.find((t) => t.key === "1405-05"); // Aug 2026
  assert.ok(mordad, "mordad month should exist");
  assert.equal(mordad!.count, 1);
  assert.match(mordad!.label, /مرداد/);
});

/* ---------------------------------- buckets -------------------------------- */

test("buckets use floor-half rounding like the pipeline", () => {
  const analytics = analyzeReviewDashboard(FIXTURE, TODAY);
  const byStars = new Map(analytics.buckets.map((b) => [b.stars, b.count]));
  assert.equal(byStars.get(5), 6); // 5, 5, 5, 4.8→5, 5, 5
  assert.equal(byStars.get(4), 1); // 4
  assert.equal(byStars.get(3), 1); // 3
  assert.equal(byStars.get(2), 2); // 2, 2
  assert.equal(byStars.get(1), 0);
  assert.equal(analytics.fiveStar, 5); // exact 5.0 ratings
  assert.equal(analytics.belowFive, 5); // 10 rated − 5 five-star
});

/* --------------------------------- empty ----------------------------------- */

test("empty review list returns empty analytics without throwing", () => {
  const analytics = analyzeReviewDashboard([], TODAY);
  assert.equal(analytics.keywords.length, 0);
  assert.equal(analytics.themes.length, 0);
  assert.equal(analytics.fun.length, 0);
  assert.equal(analytics.timeline.length, 0);
  assert.equal(analytics.uniqueUsers, 0);
  assert.equal(analytics.replied, 0);
});
