import { PositioningChart, PriceComparisonChart, RatingRadar } from "@/components/charts";
import { Card, Chip, DefinitionList, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/jajiga/dataset";
import { formatNumber, formatPercent, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "مقایسه بازار" };

export default function MarketPage() {
  const data = getDataset();
  const { owner, market, peers } = data;

  if (data.isEmpty) {
    return <Notice tone="warning">داده‌ای برای تحلیل بازار موجود نیست.</Notice>;
  }

  const priceGap = market.medianPrice
    ? (owner.basePrice - market.medianPrice) / market.medianPrice
    : 0;

  // Prefer the rate actually observed in the radar calendar over the "from"
  // price on the listing card: only the calendar shows the weekend uplift.
  const rateOf = (id: number, fallback: number) => {
    const split = data.rateSplits.get(id);
    return {
      weekday: split?.weekday || fallback,
      weekend: split?.weekend || split?.weekday || fallback,
    };
  };

  const ownerRate = rateOf(owner.id, owner.basePrice);
  const trackedPeers = peers.filter((peer) => data.rateSplits.has(peer.id));
  // Rooms with a tracked calendar carry a real weekend figure, so show those
  // first; top up with untracked peers only if there are too few to compare.
  const chartPeers = [
    ...trackedPeers,
    ...peers.filter((peer) => !data.rateSplits.has(peer.id)),
  ].slice(0, 14);

  const priceChartData = [
    { name: "اقامتگاه شما", ...ownerRate, isHost: true },
    ...chartPeers.map((peer) => ({
      name: peer.title.length > 24 ? `${peer.title.slice(0, 23)}…` : peer.title,
      ...rateOf(peer.id, peer.basePrice),
      isHost: false,
    })),
  ];

  const scatter = peers
    .filter((peer) => peer.rating !== null)
    .map((peer) => ({
      name: peer.title,
      price: peer.basePrice,
      rating: peer.rating as number,
      reviews: Math.max(peer.reviewsCount, 1),
    }));

  const radarData = [
    { subject: "دقت آگهی", score: owner.subRatings.accuracy },
    { subject: "برخورد میزبان", score: owner.subRatings.communication },
    { subject: "نظافت", score: owner.subRatings.cleanliness },
    { subject: "موقعیت", score: owner.subRatings.location },
    { subject: "تحویل", score: owner.subRatings.checkin },
    { subject: "ارزش خرید", score: owner.subRatings.value },
  ].filter((d): d is { subject: string; score: number } => d.score !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مقایسه با بازار محلی"
        description={`جایگاه «${owner.title}» در برابر ${formatNumber(
          peers.length,
        )} اقامتگاه واقعاً مشابه، انتخاب‌شده بر پایه ظرفیت، اتاق، فاصله جغرافیایی، نوع اقامتگاه و امکانات.`}
      />

      <Notice>
        قیمت‌ها نرخ پایه («نرخ هر شب از») هستند، نه قیمت تخفیف‌خورده لحظه‌ای. امتیاز نمایش‌داده‌شده
        جاجیگا میانگین <strong>۱۲ ماه اخیر</strong> است و نه کل تاریخچه — این را در مقایسه‌ها در نظر
        بگیرید.
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="نرخ پایه شما"
          value={formatToman(owner.basePrice)}
          hint={`میانه بازار ${formatToman(market.medianPrice)}`}
          tone="brand"
        />
        <KpiCard
          label="اختلاف با میانه"
          value={`${priceGap >= 0 ? "+" : "−"}${formatPercent(Math.abs(priceGap))}`}
          hint={`بازه رایج ${formatToman(market.p25)} تا ${formatToman(market.p75)}`}
          tone={Math.abs(priceGap) > 0.2 ? "warning" : "default"}
        />
        <KpiCard
          label="صدک قیمت"
          value={formatNumber(market.pricePercentile)}
          hint={`${formatNumber(market.sampleSize)} اقامتگاه مرجع`}
        />
        <KpiCard
          label="صدک امتیاز"
          value={formatNumber(market.ratingPercentile)}
          hint={`امتیاز شما ${formatNumber(owner.rating ?? 0, 1)}`}
          tone="positive"
        />
      </div>

      <Card
        title="نرخ روز عادی در برابر آخر هفته"
        subtitle={`میله پررنگ متعلق به شماست. برای ${formatNumber(
          trackedPeers.length,
        )} اقامتگاه، نرخ واقعی از تقویم رصدشده خوانده شده و بقیه نرخ پایه آگهی را نشان می‌دهند.`}
      >
        <PriceComparisonChart data={priceChartData} />
        {ownerRate.weekend > ownerRate.weekday ? null : (
          <p className="mt-3 rounded-lg bg-amber-500/8 p-3 text-[11px] leading-relaxed text-amber-200 ring-1 ring-amber-500/20">
            نرخ شما برای آخر هفته با روزهای عادی تفاوتی ندارد، در حالی که بیشتر رقبا آخر هفته
            گران‌تر می‌فروشند. این ساده‌ترین فرصت افزایش درآمد بدون از دست دادن رزرو است.
          </p>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card
          title="نقشه جایگاه: قیمت در برابر امتیاز"
          subtitle="اندازه هر نقطه نشان‌دهنده تعداد نظرات است. ستاره فیروزه‌ای شمایید."
        >
          {scatter.length >= 2 ? (
            <PositioningChart
              competitors={scatter}
              host={{
                name: owner.title,
                price: owner.basePrice,
                rating: owner.rating ?? 0,
                reviews: Math.max(owner.reviewsCount, 1),
              }}
            />
          ) : (
            <p className="py-16 text-center text-[12px] text-slate-500">داده کافی موجود نیست.</p>
          )}
        </Card>

        <Card title="ریز امتیازهای شما" subtitle="ضعیف‌ترین ضلع، اولویت بهبود است.">
          {radarData.length ? (
            <RatingRadar data={radarData} />
          ) : (
            <p className="py-16 text-center text-[12px] text-slate-500">ریز امتیاز موجود نیست.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="امکاناتی که رقبا دارند و شما ندارید"
          subtitle="دست‌کم ۲۵٪ رقبای مشابه این موارد را دارند."
        >
          {market.missingFeatures.length ? (
            <ul className="space-y-3">
              {market.missingFeatures.map((feature) => (
                <li key={feature.code}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-slate-200">{feature.label}</span>
                    <span className="num text-[11px] font-semibold text-amber-300">
                      {formatPercent(feature.share)} رقبا
                    </span>
                  </div>
                  <Meter value={feature.share} tone="warning" />
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
          title="مزیت‌های نسبی شما"
          subtitle="امکاناتی که کمتر از ۴۵٪ رقبا دارند — در عنوان آگهی برجسته‌شان کنید."
        >
          {market.uniqueFeatures.length ? (
            <div className="flex flex-wrap gap-2">
              {market.uniqueFeatures.map((feature) => (
                <Chip key={feature.code} tone="positive">
                  {feature.label}
                  <span className="num opacity-70">{formatPercent(feature.share)}</span>
                </Chip>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              امکانات شما تقریباً مشابه بقیه بازار است؛ تمایز را باید در تصاویر و کیفیت میزبانی ساخت.
            </p>
          )}

          <div className="mt-4 border-t border-white/8 pt-3">
            <p className="mb-2 text-[11px] font-bold text-slate-400">نشان‌های آگهی شما</p>
            <div className="flex flex-wrap gap-1.5">
              {owner.isPlus ? <Chip tone="warning">ممتاز</Chip> : null}
              {owner.isInstant ? <Chip tone="brand">رزرو فوری</Chip> : null}
              {owner.badges.map((badge) => (
                <Chip key={badge} tone="positive">
                  {badge}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card title="خلاصه بازار مرجع">
        <DefinitionList
          items={[
            { term: "تعداد اقامتگاه مرجع", value: formatNumber(market.sampleSize) },
            { term: "میانه نرخ پایه", value: formatToman(market.medianPrice) },
            { term: "صدک ۲۵ بازار", value: formatToman(market.p25) },
            { term: "صدک ۷۵ بازار", value: formatToman(market.p75) },
            { term: "میانه امتیاز", value: formatNumber(market.medianRating, 1) },
            { term: "میانه تعداد نظر", value: formatNumber(market.medianReviews) },
            {
              term: "میانه پر بودن تقویم ۳۰ روز",
              value:
                market.medianOccupancy !== null
                  ? `${formatPercent(market.medianOccupancy)} (تخمینی)`
                  : "بدون داده",
            },
            {
              term: "پر بودن تقویم شما",
              value:
                market.ownerOccupancy !== null ? formatPercent(market.ownerOccupancy) : "بدون داده",
            },
          ]}
        />
        <p className="mt-4 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
          «پر بودن تقویم» فقط نشان می‌دهد چه سهمی از ۳۰ شب آینده قابل رزرو نبوده است. بسته‌بودن یک
          شب لزوماً یعنی فروش نیست؛ ممکن است میزبان آن را دستی بسته باشد.
        </p>
      </Card>
    </div>
  );
}
