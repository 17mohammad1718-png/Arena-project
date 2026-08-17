import { formatNumber, formatPercent, formatToman } from "../metrics";
import type { CalendarKpis, MarketPosition, ReviewAnalysis } from "./analytics";
import type { RevenueLeaderboardRow } from "./analytics";
import type { RoomProfile } from "./load";

export type InsightTone = "positive" | "warning" | "neutral" | "opportunity";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  action?: string;
  evidence?: string;
}

/**
 * Rule-based Persian recommendations derived from the real Jajiga dataset.
 *
 * Every rule cites its evidence and stays phrased as an estimate. Where the
 * data has a known limitation (documented in docs/DATA-GUIDE.md) the caveat is
 * stated inside the insight rather than hidden.
 */
export function buildInsights(input: {
  owner: RoomProfile;
  market: MarketPosition;
  calendar: CalendarKpis;
  reviews: ReviewAnalysis | null;
  reviewTopics: { topic: string; tone: "positive" | "negative"; count: number }[];
  leaderboard: RevenueLeaderboardRow[];
  peerCount: number;
}): Insight[] {
  const { owner, market, calendar, reviews, reviewTopics, leaderboard, peerCount } = input;
  const insights: Insight[] = [];

  /* -------------------------------- Pricing -------------------------------- */

  if (market.sampleSize >= 5 && market.medianPrice > 0) {
    const gap = (owner.basePrice - market.medianPrice) / market.medianPrice;

    if (gap <= -0.08) {
      insights.push({
        id: "underpriced",
        tone: "opportunity",
        title: `نرخ پایه شما ${formatPercent(Math.abs(gap))} پایین‌تر از میانه رقبای مشابه است`,
        body: `نرخ شما ${formatToman(owner.basePrice)} و میانه ${formatNumber(
          market.sampleSize,
        )} اقامتگاه واقعاً مشابه ${formatToman(market.medianPrice)} است. با امتیاز ${formatNumber(
          owner.rating ?? 0,
          1,
        )} (صدک ${formatNumber(market.ratingPercentile)} کیفیت) احتمالاً فضای افزایش قیمت دارید.`,
        action: `آزمایش نرخ در محدوده ${formatToman(market.medianPrice)} برای چند شب و رصد اثر آن بر رزرو.`,
        evidence: `مقایسه با ${formatNumber(market.sampleSize)} اقامتگاه هم‌ظرفیت و هم‌محله`,
      });
    } else if (gap >= 0.15) {
      insights.push({
        id: "overpriced",
        tone: "warning",
        title: `نرخ پایه شما ${formatPercent(gap)} بالاتر از میانه بازار است`,
        body: `نرخ شما ${formatToman(owner.basePrice)} در برابر میانه ${formatToman(
          market.medianPrice,
        )}. بازه رایج بازار ${formatToman(market.p25)} تا ${formatToman(market.p75)} است.`,
        action: "اگر نرخ اشغال پایین است، تخفیف هدفمند روی شب‌های خالیِ نزدیک را بررسی کنید.",
        evidence: `مقایسه با ${formatNumber(market.sampleSize)} اقامتگاه مشابه`,
      });
    }
  }

  /* ------------------------- Quality vs price mismatch ---------------------- */

  if (
    owner.rating !== null &&
    market.ratingPercentile >= 70 &&
    market.pricePercentile <= 45 &&
    market.sampleSize >= 5
  ) {
    insights.push({
      id: "quality-price-mismatch",
      tone: "opportunity",
      title: "کیفیت شما بالاتر از قیمت شماست",
      body: `امتیاز شما در صدک ${formatNumber(
        market.ratingPercentile,
      )} بازار است اما قیمتتان فقط در صدک ${formatNumber(
        market.pricePercentile,
      )} قرار دارد. یعنی مهمان کیفیتی بالاتر از چیزی که پول می‌دهد دریافت می‌کند.`,
      action: "افزایش تدریجی نرخ تا نزدیک میانه بازار، به‌جای رقابت بر سر ارزان‌بودن.",
      evidence: "مقایسه هم‌زمان صدک قیمت و صدک امتیاز در مجموعه رقبای منتخب",
    });
  }

  /* ------------------------------- Occupancy ------------------------------- */

  if (calendar.availableNights >= 20) {
    if (calendar.occupancyRate < 0.2) {
      insights.push({
        id: "low-occupancy",
        tone: "warning",
        title: `تنها ${formatPercent(calendar.occupancyRate)} از شب‌های پیش رو رزرو شده است`,
        body: `از ${formatNumber(calendar.availableNights)} شب قابل رزرو، ${formatNumber(
          calendar.bookedNights,
        )} شب پر است. توجه کنید که این تقویم فقط شب‌های آینده را نشان می‌دهد؛ شب‌های دور معمولاً هنوز پر نشده‌اند.`,
        action: "تمرکز روی ۲ تا ۳ هفته نزدیک: قیمت شب‌های خالی نزدیک را رقابتی‌تر کنید.",
        evidence: "بر پایه تقویم رادار (فقط رزروهای آینده — جاجیگا تاریخچه گذشته را نمی‌دهد)",
      });
    } else if (calendar.occupancyRate > 0.6) {
      insights.push({
        id: "high-occupancy",
        tone: "positive",
        title: `نرخ اشغال آینده شما ${formatPercent(calendar.occupancyRate)} است`,
        body: "تقاضا در سطح خوبی است. در این وضعیت افزایش قیمت معمولاً درآمد کل را بالا می‌برد حتی اگر چند رزرو کمتر شود.",
        action: "افزایش پلکانی نرخ شب‌های پرتقاضا و بازبینی حداقل شب اقامت.",
        evidence: "بر پایه تقویم رادار شب‌های آینده",
      });
    }
  }

  /* --------------------------- Weekend vs weekday --------------------------- */

  if (calendar.weekdayOccupancy > 0 && calendar.weekendOccupancy > 0) {
    const diff = calendar.weekendOccupancy - calendar.weekdayOccupancy;
    if (diff > 0.2) {
      insights.push({
        id: "weekend-demand",
        tone: "opportunity",
        title: "آخر هفته‌های شما به‌مراتب پرتقاضاتر از وسط هفته است",
        body: `نرخ اشغال آخر هفته ${formatPercent(
          calendar.weekendOccupancy,
        )} در برابر ${formatPercent(calendar.weekdayOccupancy)} وسط هفته.`,
        action:
          "قیمت آخر هفته را جداگانه بالا ببرید و برای وسط هفته بسته تخفیف یا حداقل اقامت کوتاه‌تر تعریف کنید.",
        evidence: "تفکیک شب‌های چهارشنبه تا جمعه از بقیه هفته در تقویم رادار",
      });
    }
  }

  /* ------------------------------- Amenities ------------------------------- */

  const topMissing = market.missingFeatures[0];
  if (topMissing && topMissing.share >= 0.4) {
    insights.push({
      id: `missing-${topMissing.code}`,
      tone: "opportunity",
      title: `${formatPercent(topMissing.share)} رقبای مشابه «${topMissing.label}» دارند`,
      body: "این مورد در فهرست امکانات آگهی شما ثبت نشده است. اگر واقعاً وجود دارد، صرفاً نبودنش در آگهی به ضرر شماست.",
      action: `اگر «${topMissing.label}» را دارید به آگهی اضافه کنید؛ در غیر این صورت هزینه تهیه‌اش را بسنجید.`,
      evidence: `بر پایه ${formatNumber(market.sampleSize)} اقامتگاه مشابه`,
    });
  }

  const premium = ["pool", "jacuzzi"];
  const missingPremium = market.missingFeatures.filter((f) => premium.includes(f.code));
  if (missingPremium.length) {
    const labels = missingPremium.map((f) => f.label).join(" و ");
    const maxShare = Math.max(...missingPremium.map((f) => f.share));
    insights.push({
      id: "missing-premium",
      tone: "warning",
      title: `نداشتن ${labels} یک تفاوت ساختاری با بازار است`,
      body: `حدود ${formatPercent(
        maxShare,
      )} رقبای مشابه شما ${labels} دارند. این امکانات معمولاً بیشترین اثر را روی نرخ شبانه در این منطقه دارند.`,
      action: "یا سرمایه‌گذاری روی این امکانات، یا تمایز صریح بر پایه آرامش، چشم‌انداز و کیفیت میزبانی.",
      evidence: "مقایسه امکانات با مجموعه رقبای منتخب",
    });
  }

  /* -------------------------------- Reviews -------------------------------- */

  if (reviews && owner.reviewsCount > 0) {
    if (reviews.count < owner.reviewsCount) {
      insights.push({
        id: "review-gap",
        tone: "neutral",
        title: `اختلاف بین تعداد نظر کارت (${formatNumber(
          owner.reviewsCount,
        )}) و نظرات دریافتی (${formatNumber(reviews.count)})`,
        body: "این اختلاف طبیعی است؛ API جاجیگا معمولاً حدود ۱۰٪ کمتر از عدد روی کارت برمی‌گرداند. همچنین امتیاز نمایش‌داده‌شده جاجیگا میانگین ۱۲ ماه اخیر است، نه کل تاریخچه.",
        evidence: "محدودیت شناخته‌شده منبع داده — مستند در DATA-GUIDE",
      });
    }

    if (owner.reviewsCount < 15) {
      insights.push({
        id: "few-reviews",
        tone: "opportunity",
        title: `فقط ${formatNumber(owner.reviewsCount)} نظر دارید`,
        body: `امتیاز ${formatNumber(
          owner.rating ?? 0,
          1,
        )} عالی است، اما تعداد کم نظر اعتماد مهمان تازه را محدود می‌کند. میانه تعداد نظر رقبا ${formatNumber(
          market.medianReviews,
        )} است.`,
        action: "پیام یادآوری محترمانه پس از خروج مهمان برای ثبت نظر.",
        evidence: "مقایسه با مجموعه رقبای منتخب",
      });
    }

    if (reviews.replyRate >= 0.8) {
      insights.push({
        id: "reply-rate",
        tone: "positive",
        title: `به ${formatPercent(reviews.replyRate)} نظرها پاسخ داده‌اید`,
        body: "پاسخ‌گویی منظم به نظرات، سیگنال مثبتی برای مهمان بعدی است و در تصمیم رزرو اثر دارد.",
        evidence: "بر پایه نظرات دریافت‌شده از API",
      });
    }
  }

  const negativeTopic = reviewTopics.find((t) => t.tone === "negative");
  if (negativeTopic) {
    insights.push({
      id: `review-topic-${negativeTopic.topic}`,
      tone: "warning",
      title: `«${negativeTopic.topic}» در ${formatNumber(negativeTopic.count)} نظر مطرح شده است`,
      body: "این موضوع در متن نظرات مهمانان تکرار شده و معمولاً روی امتیاز «ارزش خرید» و احتمال توصیه اثر می‌گذارد.",
      action: "اگر راه‌حل کم‌هزینه‌ای دارد (مثل نصب توری پنجره) در اولویت بگذارید.",
      evidence: "تحلیل کلیدواژه‌ای متن نظرات — نه تحلیل معنایی دقیق",
    });
  }

  /* ------------------------------ Sub-ratings ------------------------------ */

  const value = owner.subRatings.value;
  if (value !== null && owner.rating !== null && value < owner.rating - 0.1) {
    insights.push({
      id: "value-for-money",
      tone: "warning",
      title: `امتیاز «ارزش خرید» شما ${formatNumber(value, 1)} است — پایین‌ترین زیرمعیار`,
      body: "این تنها معیاری است که از امتیاز کلی شما پایین‌تر است و معمولاً یعنی فاصله‌ای بین قیمت و انتظار مهمان وجود دارد.",
      action: "افزودن ارزش ملموس (پذیرایی ورود، هیزم، صبحانه ساده) معمولاً بهتر از کاهش قیمت جواب می‌دهد.",
      evidence: "ریز امتیازهای عمومی آگهی",
    });
  }

  /* --------------------------------- Host --------------------------------- */

  if (owner.host.acceptRate !== null && owner.host.acceptRate < 90) {
    insights.push({
      id: "accept-rate",
      tone: "warning",
      title: `نرخ پذیرش درخواست شما ${formatNumber(owner.host.acceptRate)}٪ است`,
      body: "رد کردن درخواست‌ها می‌تواند روی رتبه نمایش آگهی و اعتماد مهمان اثر منفی بگذارد.",
      action: "تقویم را دقیق به‌روز نگه دارید تا درخواست غیرقابل‌قبول کمتر دریافت کنید.",
      evidence: "پروفایل عمومی میزبان",
    });
  }

  /* ------------------------------ Leaderboard ------------------------------ */

  const ownerRow = leaderboard.find((row) => row.isOwn);
  if (ownerRow && leaderboard.length >= 5) {
    const top = leaderboard[0];
    insights.push({
      id: "revenue-rank",
      tone: ownerRow.rank <= Math.ceil(leaderboard.length / 3) ? "positive" : "neutral",
      title: `رتبه درآمد شما ${formatNumber(ownerRow.rank)} از ${formatNumber(
        leaderboard.length,
      )} اقامتگاه رصدشده است`,
      body: `درآمد خالص شما ${formatToman(ownerRow.net)} با ${formatNumber(
        ownerRow.booked,
      )} شب رزرو. صدرنشین «${top.title}» با ${formatToman(top.net)} از ${formatNumber(
        top.booked,
      )} شب است.`,
      action:
        ownerRow.adr < top.adr
          ? `میانگین نرخ شبانه صدرنشین ${formatToman(top.adr)} در برابر ${formatToman(ownerRow.adr)} شماست — تفاوت عمدتاً از نرخ است نه تعداد شب.`
          : undefined,
      evidence: "بر پایه رزروهای آینده اقامتگاه‌های رصدشده در همان بازه",
    });
  }

  /* ----------------------------- Peer disclosure ---------------------------- */

  if (peerCount < 8) {
    insights.push({
      id: "small-sample",
      tone: "neutral",
      title: "نمونه رقبای واقعاً مشابه کوچک است",
      body: `فقط ${formatNumber(
        peerCount,
      )} اقامتگاه با ظرفیت، اتاق و موقعیت نزدیک به شما پیدا شد. نتیجه‌گیری‌های قیمتی را با احتیاط بیشتری بپذیرید.`,
      evidence: "شمار اعضای مجموعه رقبای منتخب",
    });
  }

  return insights;
}

export const TONE_STYLES: Record<
  InsightTone,
  {
    chip: "positive" | "danger" | "warning" | "brand";
    ring: string;
    text: string;
    label: string;
  }
> = {
  positive: {
    chip: "positive",
    ring: "ring-emerald-500/25",
    text: "text-emerald-200",
    label: "نقطه قوت",
  },
  warning: {
    chip: "danger",
    ring: "ring-rose-500/25",
    text: "text-rose-200",
    label: "هشدار",
  },
  opportunity: {
    chip: "warning",
    ring: "ring-amber-500/25",
    text: "text-amber-200",
    label: "فرصت",
  },
  neutral: {
    chip: "brand",
    ring: "ring-sky-500/25",
    text: "text-sky-200",
    label: "تحلیل",
  },
};
