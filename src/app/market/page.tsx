import { PositioningChart, PriceComparisonChart, RatingRadar } from "@/components/charts";
import { Card, Chip, DefinitionList, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { loadDataset } from "@/lib/load-dataset";
import {
  computeMarketPosition,
  formatNumber,
  formatPercent,
  formatToman,
  rankCompetitors,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "مقایسه بازار" };

export default function MarketPage() {
  const dataset = loadDataset();
  const { property } = dataset;

  const ranked = rankCompetitors(property, dataset.competitors);
  // Benchmark only against listings that are genuinely comparable.
  const peers = ranked.filter((c) => c.similarity >= 0.55);
  const benchmarkSet = peers.length >= 3 ? peers : ranked.slice(0, Math.min(6, ranked.length));
  const market = computeMarketPosition(property, benchmarkSet);

  const hostWeekend = property.weekendPrice ?? property.basePrice;
  const weekdayGap = market.medianWeekday
    ? (property.basePrice - market.medianWeekday) / market.medianWeekday
    : 0;
  const weekendGap = market.medianWeekend
    ? (hostWeekend - market.medianWeekend) / market.medianWeekend
    : 0;

  const priceChartData = [
    {
      name: "اقامتگاه شما",
      weekday: property.basePrice,
      weekend: hostWeekend,
      isHost: true,
    },
    ...benchmarkSet.map((c) => ({
      name: c.title.length > 24 ? `${c.title.slice(0, 23)}…` : c.title,
      weekday: c.weekdayPrice,
      weekend: c.weekendPrice ?? c.weekdayPrice,
      isHost: false,
    })),
  ];

  const scatterCompetitors = benchmarkSet
    .filter((c) => typeof c.rating === "number")
    .map((c) => ({
      name: c.title,
      price: c.weekdayPrice,
      rating: c.rating ?? 0,
      reviews: c.reviewsCount ?? 1,
    }));

  const radarData = property.ratingBreakdown
    ? [
        { subject: "دقت آگهی", score: property.ratingBreakdown.accuracy ?? 0 },
        { subject: "برخورد میزبان", score: property.ratingBreakdown.hostBehavior ?? 0 },
        { subject: "نظافت", score: property.ratingBreakdown.cleanliness ?? 0 },
        { subject: "موقعیت", score: property.ratingBreakdown.location ?? 0 },
        { subject: "تحویل به‌موقع", score: property.ratingBreakdown.handover ?? 0 },
        { subject: "ارزش خرید", score: property.ratingBreakdown.valueForMoney ?? 0 },
      ].filter((d) => d.score > 0)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مقایسه با بازار محلی"
        description={`جایگاه «${property.title}» در برابر ${formatNumber(
          benchmarkSet.length,
        )} اقامتگاه واقعاً مشابه، بر پایه ظرفیت، تعداد اتاق، فاصله، نوع اقامتگاه و امکانات.`}
      />

      <Notice>
        قیمت‌های رقبا نرخ اعلام‌شده عمومی هستند و ممکن است شامل تخفیف لحظه‌ای، هزینه نفر اضافه یا
        قوانین حداقل اقامت نباشند. این مقایسه یک برآورد جهت‌دهنده است، نه قیمت نهایی بازار.
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="صدک قیمت روز عادی"
          value={formatNumber(market.weekdayPercentile)}
          hint={`میانه بازار ${formatToman(market.medianWeekday)}`}
          tone="brand"
        />
        <KpiCard
          label="صدک قیمت آخر هفته"
          value={formatNumber(market.weekendPercentile)}
          hint={`میانه بازار ${formatToman(market.medianWeekend)}`}
        />
        <KpiCard
          label="اختلاف با میانه (روز عادی)"
          value={`${weekdayGap >= 0 ? "+" : "−"}${formatPercent(Math.abs(weekdayGap))}`}
          hint={formatToman(property.basePrice)}
          tone={Math.abs(weekdayGap) > 0.2 ? "warning" : "default"}
        />
        <KpiCard
          label="اختلاف با میانه (آخر هفته)"
          value={`${weekendGap >= 0 ? "+" : "−"}${formatPercent(Math.abs(weekendGap))}`}
          hint={formatToman(hostWeekend)}
          tone={Math.abs(weekendGap) > 0.2 ? "warning" : "default"}
        />
      </div>

      <Card
        title="مقایسه قیمت شبانه"
        subtitle="میله فیروزه‌ای و نارنجی پررنگ متعلق به اقامتگاه شماست؛ میله بالایی روز عادی و پایینی آخر هفته."
      >
        <PriceComparisonChart data={priceChartData} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card
          title="نقشه جایگاه: قیمت در برابر امتیاز"
          subtitle="اندازه هر نقطه نشان‌دهنده تعداد نظرات است. ستاره فیروزه‌ای اقامتگاه شماست."
        >
          {scatterCompetitors.length >= 2 ? (
            <PositioningChart
              competitors={scatterCompetitors}
              host={{
                name: property.title,
                price: property.basePrice,
                rating: property.rating ?? 0,
                reviews: property.reviewsCount ?? 1,
              }}
            />
          ) : (
            <p className="py-16 text-center text-[12px] text-slate-500">
              برای رسم این نمودار حداقل به امتیاز دو رقیب نیاز است.
            </p>
          )}
        </Card>

        <Card title="ریز امتیازهای شما" subtitle="نقطه‌ای که از بقیه عقب‌تر است، اولویت بهبود است.">
          {radarData.length ? (
            <RatingRadar data={radarData} />
          ) : (
            <p className="py-16 text-center text-[12px] text-slate-500">
              ریز امتیازها هنوز ثبت نشده است.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="امکاناتی که ندارید"
          subtitle="امکاناتی که دست‌کم ۳۰٪ رقبای مشابه دارند و در آگهی شما ثبت نشده است."
        >
          {market.missingAmenities.length ? (
            <ul className="space-y-3">
              {market.missingAmenities.map((amenity) => (
                <li key={amenity.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-slate-200">{amenity.name}</span>
                    <span className="num text-[11px] font-semibold text-amber-300">
                      {formatPercent(amenity.share)} رقبا
                    </span>
                  </div>
                  <Meter value={amenity.share} tone="warning" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              امکان شاخصی که رقبا داشته باشند و شما نداشته باشید پیدا نشد.
            </p>
          )}
        </Card>

        <Card
          title="مزیت‌های متمایز شما"
          subtitle="امکاناتی که کمتر از ۴۰٪ رقبا دارند — اینها باید در عنوان آگهی برجسته شوند."
        >
          {market.uniqueAmenities.length ? (
            <div className="flex flex-wrap gap-2">
              {market.uniqueAmenities.map((amenity) => (
                <Chip key={amenity.name} tone="positive">
                  {amenity.name}
                  <span className="num opacity-70">{formatPercent(amenity.share)}</span>
                </Chip>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              امکانات شما تقریباً مشابه بقیه بازار است؛ تمایز را باید در تصاویر و خدمات ساخت.
            </p>
          )}
        </Card>
      </div>

      <Card title="خلاصه بازار مرجع">
        <DefinitionList
          items={[
            { term: "تعداد اقامتگاه مرجع", value: formatNumber(market.sampleSize) },
            { term: "میانه قیمت روز عادی", value: formatToman(market.medianWeekday) },
            { term: "میانه قیمت آخر هفته", value: formatToman(market.medianWeekend) },
            { term: "بازه رایج (صدک ۲۵ تا ۷۵)", value: `${formatToman(market.p25Weekday)} — ${formatToman(market.p75Weekday)}` },
            { term: "میانه امتیاز", value: formatNumber(market.medianRating, 1) },
            { term: "میانه تعداد نظر", value: formatNumber(market.medianReviews) },
            {
              term: "برآورد پر بودن تقویم رقبا",
              value:
                market.availabilityEstimate === null
                  ? "بدون داده"
                  : `${formatPercent(market.availabilityEstimate)} (تخمینی)`,
            },
          ]}
        />
        <p className="mt-4 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
          «برآورد پر بودن تقویم» فقط نشان می‌دهد چه سهمی از شب‌های عمومی رقبا قابل رزرو نبوده است.
          بسته‌بودن یک شب لزوماً به‌معنای فروش آن نیست؛ ممکن است میزبان آن را دستی مسدود کرده باشد.
        </p>
      </Card>
    </div>
  );
}
