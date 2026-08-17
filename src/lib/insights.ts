import { formatNumber, formatPercent, formatToman } from "./metrics";
import type { Kpis, MarketPosition, MonthlyPoint } from "./metrics";
import type { Dataset } from "./types";

export type InsightTone = "positive" | "warning" | "neutral" | "opportunity";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  /** What the host can actually do next. */
  action?: string;
  /** Explains the evidence, so nothing looks like a black-box claim. */
  evidence?: string;
}

/**
 * Rule-based Persian recommendations.
 *
 * Every rule states its evidence and is phrased as an estimate — the product
 * principle is that no inferred number is ever presented as confirmed fact.
 */
export function buildInsights(
  dataset: Dataset,
  kpis: Kpis,
  market: MarketPosition,
  monthly: MonthlyPoint[],
): Insight[] {
  const insights: Insight[] = [];
  const { property } = dataset;

  /* ------------------------------ Weekend price ----------------------------- */
  const hostWeekend = property.weekendPrice ?? property.basePrice;
  if (market.sampleSize >= 3 && market.medianWeekend > 0) {
    const gap = (hostWeekend - market.medianWeekend) / market.medianWeekend;
    if (gap <= -0.08) {
      insights.push({
        id: "weekend-underpriced",
        tone: "opportunity",
        title: `قیمت آخر هفته شما ${formatPercent(Math.abs(gap))} پایین‌تر از میانه بازار است`,
        body: `قیمت آخر هفته شما ${formatToman(hostWeekend)} و میانه رقبای مشابه ${formatToman(
          market.medianWeekend,
        )} است. با توجه به امتیاز ${formatNumber(property.rating ?? 0, 1)} احتمالاً فضای افزایش قیمت دارید.`,
        action: `آزمایش افزایش پلکانی تا حدود ${formatToman(market.medianWeekend)} برای چند آخر هفته و بررسی اثر آن بر نرخ رزرو.`,
        evidence: `مقایسه با ${formatNumber(market.sampleSize)} اقامتگاه مشابه`,
      });
    } else if (gap >= 0.15) {
      insights.push({
        id: "weekend-overpriced",
        tone: "warning",
        title: `قیمت آخر هفته شما ${formatPercent(gap)} بالاتر از میانه بازار است`,
        body: `قیمت شما ${formatToman(hostWeekend)} در برابر میانه ${formatToman(
          market.medianWeekend,
        )} است. اگر نرخ اشغال آخر هفته پایین است، این اختلاف می‌تواند یکی از دلایل باشد.`,
        action: "بررسی نرخ اشغال آخر هفته‌ها؛ در صورت پایین بودن، تخفیف هدفمند برای شب‌های خالی نزدیک.",
        evidence: `مقایسه با ${formatNumber(market.sampleSize)} اقامتگاه مشابه`,
      });
    }
  }

  /* ------------------------------- Percentile ------------------------------ */
  if (market.sampleSize >= 3) {
    insights.push({
      id: "price-percentile",
      tone: "neutral",
      title: `قیمت روز عادی شما در صدک ${formatNumber(market.weekdayPercentile)} بازار محلی است`,
      body: `یعنی حدود ${formatPercent(market.weekdayPercentile / 100)} اقامتگاه‌های مشابه ارزان‌تر یا هم‌قیمت شما هستند. بازه رایج بازار بین ${formatToman(
        market.p25Weekday,
      )} تا ${formatToman(market.p75Weekday)} است.`,
      evidence: "بر پایه قیمت اعلام‌شده رقبا، بدون در نظر گرفتن تخفیف‌های لحظه‌ای",
    });
  }

  /* -------------------------------- Occupancy ------------------------------ */
  if (kpis.availableNights >= 30) {
    if (kpis.occupancyRate < 0.35) {
      insights.push({
        id: "low-occupancy",
        tone: "warning",
        title: `نرخ اشغال ${formatPercent(kpis.occupancyRate)} است`,
        body: `از ${formatNumber(kpis.availableNights)} شب قابل رزرو، ${formatNumber(
          kpis.bookedNights,
        )} شب رزرو شده است. درآمد به ازای هر شب قابل رزرو (RevPAN) ${formatToman(kpis.revpan)} است.`,
        action: "کاهش قیمت شب‌های وسط هفته یا فعال‌کردن تخفیف اقامت بلندمدت برای پر کردن شب‌های خالی.",
        evidence: "محاسبه بر پایه شب‌های رزروشده تقسیم بر شب‌های قابل رزرو",
      });
    } else if (kpis.occupancyRate > 0.75) {
      insights.push({
        id: "high-occupancy",
        tone: "positive",
        title: `نرخ اشغال ${formatPercent(kpis.occupancyRate)} بالاست`,
        body: `تقاضا بیش از ظرفیت فعلی شماست. با این سطح اشغال، افزایش قیمت معمولاً درآمد کل را بالا می‌برد حتی اگر چند رزرو کمتر شود.`,
        action: "افزایش تدریجی قیمت شب‌های پرتقاضا و بازبینی حداقل شب اقامت.",
        evidence: "محاسبه بر پایه شب‌های رزروشده تقسیم بر شب‌های قابل رزرو",
      });
    }
  }

  /* ---------------------------- Weekend vs weekday -------------------------- */
  if (kpis.weekdayAdr > 0 && kpis.weekendAdr > 0) {
    const spread = (kpis.weekendAdr - kpis.weekdayAdr) / kpis.weekdayAdr;
    if (spread < 0.15) {
      insights.push({
        id: "weak-weekend-spread",
        tone: "opportunity",
        title: "اختلاف قیمت آخر هفته و وسط هفته کم است",
        body: `میانگین نرخ آخر هفته ${formatToman(kpis.weekendAdr)} و وسط هفته ${formatToman(
          kpis.weekdayAdr,
        )} است؛ تنها ${formatPercent(Math.max(spread, 0))} اختلاف. در شمال ایران تقاضای چهارشنبه تا جمعه معمولاً بیشتر است.`,
        action: "تعریف نرخ جداگانه برای چهارشنبه، پنجشنبه و جمعه به‌جای یک نرخ ثابت هفتگی.",
        evidence: "بر پایه درآمد شب‌های رزروشده در بازه انتخابی",
      });
    }
  }

  /* ------------------------------- Amenities ------------------------------- */
  const topMissing = market.missingAmenities[0];
  if (topMissing) {
    insights.push({
      id: `missing-${topMissing.name}`,
      tone: "opportunity",
      title: `${formatPercent(topMissing.share)} رقبای شما «${topMissing.name}» دارند`,
      body: `این امکان در اقامتگاه شما ثبت نشده است. نبود آن می‌تواند در مقایسه مستقیم مهمان با گزینه‌های مشابه به ضرر شما تمام شود.`,
      action: `بررسی هزینه افزودن «${topMissing.name}» یا در صورت وجود، اضافه‌کردن آن به فهرست امکانات آگهی.`,
      evidence: `بر پایه ${formatNumber(market.sampleSize)} اقامتگاه مشابه`,
    });
  }

  const topUnique = market.uniqueAmenities[0];
  if (topUnique && market.sampleSize >= 3) {
    insights.push({
      id: `unique-${topUnique.name}`,
      tone: "positive",
      title: `«${topUnique.name}» مزیت متمایز شماست`,
      body: `تنها ${formatPercent(topUnique.share)} رقبای نزدیک این امکان را دارند. این نقطه تمایز باید در عنوان و تصاویر اول آگهی برجسته شود.`,
      action: "قراردادن این مزیت در عنوان آگهی و اولین تصویر گالری.",
      evidence: `بر پایه ${formatNumber(market.sampleSize)} اقامتگاه مشابه`,
    });
  }

  /* --------------------------------- Rating -------------------------------- */
  const valueScore = property.ratingBreakdown?.valueForMoney;
  if (valueScore && property.rating && valueScore < property.rating - 0.1) {
    insights.push({
      id: "value-for-money",
      tone: "warning",
      title: `امتیاز «ارزش خرید» (${formatNumber(valueScore, 1)}) از امتیاز کلی شما پایین‌تر است`,
      body: "این تنها معیاری است که زیر میانگین سایر معیارهای شماست و معمولاً نشانه فاصله بین قیمت و انتظار مهمان است.",
      action: "افزودن ارزش ملموس (پذیرایی ورود، هیزم، صبحانه ساده) به‌جای کاهش مستقیم قیمت.",
      evidence: "بر پایه ریز امتیازهای عمومی آگهی",
    });
  }

  if (property.reviewsCount !== undefined && property.reviewsCount < 15) {
    insights.push({
      id: "low-review-count",
      tone: "opportunity",
      title: `تنها ${formatNumber(property.reviewsCount)} نظر ثبت شده است`,
      body: `امتیاز ${formatNumber(property.rating ?? 0, 1)} عالی است اما تعداد نظر کم، اعتماد مهمان جدید را محدود می‌کند. میانه تعداد نظر رقبا ${formatNumber(
        market.medianReviews,
      )} است.`,
      action: "پیام یادآوری محترمانه بعد از خروج مهمان برای ثبت نظر.",
      evidence: "مقایسه تعداد نظرات با رقبای منتخب",
    });
  }

  /* ------------------------------- Cancellations ---------------------------- */
  if (kpis.cancellationRate > 0.1 && kpis.reservationsCount >= 5) {
    insights.push({
      id: "cancellations",
      tone: "warning",
      title: `نرخ لغو ${formatPercent(kpis.cancellationRate)} است`,
      body: `${formatNumber(kpis.cancelledCount)} رزرو لغو شده است. لغو دیرهنگام معمولاً شب‌هایی را خالی می‌گذارد که دیگر فرصت فروش ندارند.`,
      action: "بررسی شفافیت توضیحات آگهی (شیب دسترسی، آب، گاز) و قوانین کنسلی.",
      evidence: "بر پایه رزروهای ثبت‌شده در بازه انتخابی",
    });
  }

  /* -------------------------------- Conversion ------------------------------ */
  if (kpis.conversionRate !== null && kpis.views > 200) {
    const rate = kpis.conversionRate;
    insights.push({
      id: "conversion",
      tone: rate < 0.01 ? "warning" : "neutral",
      title: `نرخ تبدیل بازدید به رزرو ${formatPercent(rate, 2)} است`,
      body: `${formatNumber(kpis.views)} بازدید منجر به ${formatNumber(
        kpis.reservationsCount,
      )} رزرو شده است. ${
        rate < 0.01
          ? "بازدید کافی وجود دارد اما تبدیل پایین است؛ معمولاً مشکل از تصاویر، قیمت یا توضیحات است نه از دیده‌نشدن آگهی."
          : "نسبت بازدید به رزرو در محدوده قابل قبول است."
      }`,
      action:
        rate < 0.01
          ? "بازبینی سه تصویر اول آگهی و بازنویسی پاراگراف اول توضیحات."
          : undefined,
      evidence: "نیازمند داده بازدید پنل میزبان؛ در حالت نمایشی تخمینی است",
    });
  }

  /* ------------------------------ Best/worst month --------------------------- */
  const withRevenue = monthly.filter((m) => m.availableNights >= 15);
  if (withRevenue.length >= 3) {
    const best = [...withRevenue].sort((a, b) => b.revpan - a.revpan)[0];
    const worst = [...withRevenue].sort((a, b) => a.revpan - b.revpan)[0];
    insights.push({
      id: "seasonality",
      tone: "neutral",
      title: `${best.label} پربازده‌ترین و ${worst.label} کم‌بازده‌ترین ماه شماست`,
      body: `درآمد به ازای شب قابل رزرو در ${best.label} برابر ${formatToman(
        best.revpan,
      )} و در ${worst.label} برابر ${formatToman(worst.revpan)} بوده است.`,
      action: `برنامه‌ریزی تعمیرات و استفاده شخصی در ${worst.label} به‌جای ماه‌های پرتقاضا.`,
      evidence: "بر پایه ماه‌هایی با حداقل ۱۵ شب قابل رزرو",
    });
  }

  /* ------------------------------ Net profit ------------------------------- */
  if (kpis.grossRevenue > 0) {
    const margin = kpis.netProfit / kpis.grossRevenue;
    insights.push({
      id: "net-margin",
      tone: margin < 0.5 ? "warning" : "positive",
      title: `حاشیه سود خالص شما ${formatPercent(margin)} است`,
      body: `از ${formatToman(kpis.grossRevenue)} درآمد ناخالص، ${formatToman(
        kpis.platformFees,
      )} کارمزد پلتفرم و ${formatToman(kpis.expenses)} هزینه ثبت‌شده کسر شده و ${formatToman(
        kpis.netProfit,
      )} سود خالص باقی مانده است.`,
      evidence: "هزینه‌های ثبت‌نشده در این محاسبه لحاظ نمی‌شوند",
    });
  }

  return insights;
}

export const TONE_STYLES: Record<InsightTone, { chip: string; border: string; label: string }> = {
  positive: {
    chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    border: "border-emerald-500/25",
    label: "نقطه قوت",
  },
  warning: {
    chip: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    border: "border-rose-500/25",
    label: "هشدار",
  },
  opportunity: {
    chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    border: "border-amber-500/25",
    label: "فرصت",
  },
  neutral: {
    chip: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    border: "border-sky-500/25",
    label: "تحلیل",
  },
};
