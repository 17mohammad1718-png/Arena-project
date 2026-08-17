import path from "node:path";

import Link from "next/link";

import {
  PositioningChart,
  PriceComparisonChart,
  RatingRadar,
  SupplyTrendChart,
} from "@/components/charts";
import { Card, Chip, DefinitionList, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { toJalali, toJalaliLong } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { listSets } from "@/lib/db/market";
import { computeMarketPosition } from "@/lib/jajiga/analytics";
import { getDataset } from "@/lib/jajiga/dataset";
import { OWNER_ROOM_ID } from "@/lib/jajiga/load";
import { marketOccupancyTrend, priceChangesBetweenCaptures } from "@/lib/market-trends";
import { computeSupplyTrend, loadSupplySnapshots } from "@/lib/supply";
import { formatNumber, formatPercent, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "مقایسه بازار" };

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const params = await searchParams;
  const data = getDataset();
  const { owner } = data;

  if (data.isEmpty) {
    return <Notice tone="warning">داده‌ای برای تحلیل بازار موجود نیست.</Notice>;
  }

  // N1: the benchmark reference group is switchable — default automatic peers,
  // or any saved competitor set picked via ?set=<id>.
  const sets = listSets(getDb());
  // (db reused below for trend queries)
  const activeSetId = Number(params.set) || null;
  const activeSet = activeSetId ? (sets.find((s) => s.id === activeSetId) ?? null) : null;
  const setRooms = activeSet
    ? data.competitors.filter((room) => activeSet.roomIds.includes(room.id))
    : null;

  const peers = setRooms?.length ? setRooms : data.peers;
  const market =
    setRooms?.length ? computeMarketPosition(owner, setRooms) : data.market;

  // N3: market direction — supply snapshots + archived occupancy captures.
  const supply = computeSupplyTrend(
    loadSupplySnapshots(path.join(process.cwd(), "data")).snapshots,
  );
  const db = getDb();
  const occupancyTrend = marketOccupancyTrend(db, OWNER_ROOM_ID);
  const priceMoves = priceChangesBetweenCaptures(db).filter(
    (change) => Math.abs(change.changePercent) >= 0.03,
  );

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
        description={
          activeSet
            ? `جایگاه «${owner.title}» در برابر مجموعه ذخیره‌شده «${activeSet.name}» (${formatNumber(
                peers.length,
              )} اقامتگاه).`
            : `جایگاه «${owner.title}» در برابر ${formatNumber(
                peers.length,
              )} اقامتگاه واقعاً مشابه، انتخاب‌شده بر پایه ظرفیت، اتاق، فاصله جغرافیایی، نوع اقامتگاه و امکانات.`
        }
      />

      {sets.length ? (
        <div className="no-print flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400">گروه مرجع:</span>
          <Link
            href="/market"
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ring-1 transition ${
              !activeSet
                ? "bg-brand-500/20 text-brand-200 ring-brand-400/40"
                : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/8"
            }`}
          >
            انتخاب خودکار ({formatNumber(data.peers.length)})
          </Link>
          {sets.map((set) => (
            <Link
              key={set.id}
              href={`/market?set=${set.id}`}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ring-1 transition ${
                activeSet?.id === set.id
                  ? "bg-brand-500/20 text-brand-200 ring-brand-400/40"
                  : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/8"
              }`}
            >
              {set.name} ({formatNumber(set.roomIds.length)})
            </Link>
          ))}
        </div>
      ) : null}

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

      {/* ------------------------- Market direction (N3) ------------------------- */}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card
          title="روند عرضه بابلکنار"
          subtitle={
            supply.first && supply.last
              ? `از ${toJalaliLong(supply.first.date)} تا ${toJalaliLong(supply.last.date)} — ${formatNumber(
                  supply.points.length,
                )} اسنپ‌شات روزانه`
              : "اسنپ‌شات عرضه در دسترس نیست"
          }
        >
          {supply.points.length >= 2 ? (
            <>
              <SupplyTrendChart
                data={supply.points.map((point) => ({
                  ...point,
                  label: toJalali(point.date).slice(5),
                }))}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-white/4 p-3 text-[11px]">
                  <p className="text-slate-400">تغییر کل آگهی‌ها</p>
                  <p
                    className={`num mt-1 text-[14px] font-extrabold ${
                      supply.babolkenarDelta > 0
                        ? "text-amber-300"
                        : supply.babolkenarDelta < 0
                          ? "text-emerald-300"
                          : "text-slate-200"
                    }`}
                  >
                    {supply.babolkenarDelta > 0 ? "+" : ""}
                    {formatNumber(supply.babolkenarDelta)}
                  </p>
                </div>
                <div className="rounded-lg bg-white/4 p-3 text-[11px]">
                  <p className="text-slate-400">کلبه‌های جدید در پنجره</p>
                  <p className="num mt-1 text-[14px] font-extrabold text-slate-200">
                    {formatNumber(supply.newRoomIds.length)}
                  </p>
                </div>
                <div className="rounded-lg bg-white/4 p-3 text-[11px]">
                  <p className="text-slate-400">خارج‌شده از فهرست</p>
                  <p className="num mt-1 text-[14px] font-extrabold text-slate-200">
                    {formatNumber(supply.goneRoomIds.length)}
                  </p>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
                عرضه بیشتر یعنی رقابت شدیدتر بر سر همان مهمان‌ها. «خارج‌شده» می‌تواند حذف آگهی یا
                غیرفعال‌شدن موقت باشد؛ این عدد از حضور شناسه اتاق در اسنپ‌شات استخراج می‌شود.
              </p>
            </>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              حداقل دو اسنپ‌شات عرضه لازم است.
            </p>
          )}
        </Card>

        <Card
          title="جهت بازار بین برش‌های آرشیو"
          subtitle="از داده‌های npm run archive — هر برش یک مشاهده کامل تقویم رقباست."
        >
          {occupancyTrend.length >= 2 ? (
            <div className="space-y-2">
              {occupancyTrend.map((point, index) => {
                const prev = index > 0 ? occupancyTrend[index - 1] : null;
                const delta = prev ? point.avgOccupancy - prev.avgOccupancy : null;
                return (
                  <div
                    key={point.capturedAt}
                    className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-[12px]"
                  >
                    <span className="num text-slate-300">{toJalali(point.capturedAt)}</span>
                    <span className="num text-slate-400">
                      {formatNumber(point.rooms)} اتاق
                    </span>
                    <span className="num font-bold text-slate-100">
                      {formatPercent(point.avgOccupancy)}
                      {delta !== null ? (
                        <span
                          className={`mr-1.5 text-[10px] ${
                            delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-500"
                          }`}
                        >
                          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}
                          {formatPercent(Math.abs(delta))}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
              <p className="rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
                بالارفتن این عدد یعنی تقویم منطقه در حال پر شدن است — فرصت برای نرخ بالاتر در
                شب‌های باز شما.
              </p>
            </div>
          ) : (
            <p className="py-6 text-center text-[12px] leading-relaxed text-slate-500">
              یک برش آرشیو ذخیره شده است. بعد از رفرش بعدی دیتاست،{" "}
              <code className="font-mono">npm run archive</code> را اجرا کنید تا جهت اشغال بازار
              اینجا ساخته شود.
            </p>
          )}

          {priceMoves.length ? (
            <div className="mt-4 border-t border-white/8 pt-3">
              <p className="mb-2 text-[11px] font-bold text-slate-300">
                تغییرات قیمت از برش قبل (±۳٪ به بالا)
              </p>
              <ul className="space-y-1.5">
                {priceMoves.slice(0, 8).map((change) => {
                  const room = data.competitors.find((candidate) => candidate.id === change.roomId);
                  return (
                    <li key={change.roomId} className="flex items-center justify-between text-[11px]">
                      <Link
                        href={`/competitors/${change.roomId}`}
                        className="max-w-[200px] truncate text-slate-300 transition hover:text-brand-300"
                      >
                        {room?.title ?? `اتاق ${formatNumber(change.roomId)}`}
                      </Link>
                      <span
                        className={`num font-bold ${
                          change.changePercent > 0 ? "text-amber-300" : "text-emerald-300"
                        }`}
                      >
                        {change.changePercent > 0 ? "▲" : "▼"}
                        {formatPercent(Math.abs(change.changePercent))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
