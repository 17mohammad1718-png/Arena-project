import Link from "next/link";

import { NightsChart, RateChart, RevenueTrendChart, WeekdayChart } from "@/components/charts";
import {
  IconBed,
  IconGuests,
  IconMoney,
  IconNights,
  IconPercent,
  IconStar,
  IconTrend,
} from "@/components/icons";
import { Card, Chip, DefinitionList, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { toJalaliLong } from "@/lib/dates";
import { getDataset } from "@/lib/jajiga/dataset";
import { formatNumber, formatPercent, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const data = getDataset();
  const { owner, calendarKpis: kpis, market } = data;

  if (data.isEmpty) {
    return (
      <Notice tone="warning" title="داده‌ای یافت نشد">
        فایل‌های دیتاست در پوشه <code className="font-mono">data/</code> پیدا نشدند. صفحه «منبع
        داده» جزئیات را نشان می‌دهد.
      </Notice>
    );
  }

  const ownerRealized = data.realizedLeaderboard?.find((row) => row.isOwn);

  return (
    <div className="space-y-6">
      <PageHeader
        title="نمای کلی عملکرد"
        description={`${owner.title} — ${owner.village}. تقویم رزرو از ${toJalaliLong(
          kpis.rangeStart,
        )} تا ${toJalaliLong(kpis.rangeEnd)}.`}
        action={
          <a
            href={owner.url}
            target="_blank"
            rel="noreferrer"
            className="no-print rounded-xl bg-white/6 px-3 py-2 text-[11px] font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            مشاهده آگهی در جاجیگا ↗
          </a>
        }
      />

      <Notice title="این تقویم فقط آینده را نشان می‌دهد">
        جاجیگا تاریخچه رزروهای گذشته را در دسترس قرار نمی‌دهد. شاخص‌های زیر بر پایه{" "}
        <strong>شب‌های پیش رو</strong> محاسبه شده‌اند، بنابراین نرخ اشغال پایین برای ماه‌های دور
        طبیعی است. درآمد محقق‌شده فقط برای بازه کوتاهی که پایپ‌لاین ثبت کرده موجود است.
      </Notice>

      {/* --------------------------------- KPIs -------------------------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          label="نرخ پایه فعلی"
          value={formatToman(owner.basePrice)}
          icon={<IconMoney className="size-4" />}
          hint={`میانه رقبا ${formatToman(market.medianPrice)}`}
          tone="brand"
        />
        <KpiCard
          label="صدک قیمت در بازار"
          value={formatNumber(market.pricePercentile)}
          icon={<IconPercent className="size-4" />}
          hint={`از ${formatNumber(market.sampleSize)} رقیب مشابه`}
        />
        <KpiCard
          label="امتیاز و جایگاه کیفی"
          value={owner.rating !== null ? formatNumber(owner.rating, 1) : "—"}
          icon={<IconStar className="size-4" />}
          hint={`صدک ${formatNumber(market.ratingPercentile)} · ${formatNumber(
            owner.reviewsCount,
          )} نظر`}
          tone="positive"
        />
        <KpiCard
          label="رزروهای موفق"
          value={formatNumber(owner.successBooks)}
          icon={<IconNights className="size-4" />}
          hint="از ابتدای فعالیت آگهی"
        />
        <KpiCard
          label="شب‌های رزروشده پیش رو"
          value={formatNumber(kpis.bookedNights)}
          icon={<IconBed className="size-4" />}
          hint={`از ${formatNumber(kpis.availableNights)} شب قابل رزرو`}
        />
        <KpiCard
          label="نرخ اشغال آینده"
          value={formatPercent(kpis.occupancyRate)}
          icon={<IconPercent className="size-4" />}
          hint={`${formatNumber(kpis.blockedNights)} شب بسته توسط شما`}
          tone={kpis.occupancyRate < 0.2 ? "warning" : "default"}
        />
        <KpiCard
          label="درآمد ناخالص پیش رو"
          value={formatToman(kpis.grossRevenue)}
          icon={<IconTrend className="size-4" />}
          hint={`خالص ${formatToman(kpis.netRevenue)} پس از ۱۲٪ کمیسیون`}
        />
        <KpiCard
          label="میانگین نرخ شب رزروشده"
          value={kpis.adr > 0 ? formatToman(kpis.adr) : "—"}
          icon={<IconGuests className="size-4" />}
          hint={kpis.revpan > 0 ? `RevPAN ${formatToman(kpis.revpan)}` : "هنوز رزروی ثبت نشده"}
        />
      </div>

      {/* ------------------------------- Realized ------------------------------ */}
      {ownerRealized ? (
        <Card
          title="درآمد محقق‌شده (بازه ثبت‌شده)"
          subtitle={data.realizedRange ?? undefined}
          action={
            <Link
              href="/revenue"
              className="no-print text-[11px] font-semibold text-brand-300 hover:text-brand-200"
            >
              مقایسه با کل منطقه ←
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="شب رزروشده" value={formatNumber(ownerRealized.booked)} />
            <MiniStat label="درآمد ناخالص" value={formatToman(ownerRealized.grossDiscounted)} />
            <MiniStat label="کمیسیون جاجیگا" value={formatToman(ownerRealized.commission)} />
            <MiniStat
              label="درآمد خالص"
              value={formatToman(ownerRealized.net)}
              tone="positive"
            />
          </div>
          <p className="mt-3 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
            رتبه شما در این بازه <strong className="text-slate-200">{formatNumber(ownerRealized.rank)}</strong> از{" "}
            {formatNumber(data.realizedLeaderboard?.length ?? 0)} اقامتگاه رصدشده بود، با میانگین نرخ
            شبانه {formatToman(ownerRealized.adr)}.
            {ownerRealized.discountTotal > 0 ? (
              <> مجموع تخفیف اعمال‌شده {formatToman(ownerRealized.discountTotal)}.</>
            ) : null}
          </p>
        </Card>
      ) : null}

      {/* -------------------------------- Charts ------------------------------- */}
      <Card
        title="روند رزرو و درآمد ماه‌های پیش رو"
        subtitle="ماه‌های دورتر طبیعتاً خالی‌ترند؛ این نمودار سرعت پر شدن تقویم را نشان می‌دهد."
      >
        <RevenueTrendChart data={data.monthly} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="نرخ شبانه در برابر بازده واقعی" subtitle="فاصله ADR و RevPAN یعنی ظرفیت فروش‌نرفته.">
          <RateChart data={data.monthly} />
        </Card>
        <Card title="شب‌های رزروشده و خالی" subtitle="هر ستون کل شب‌های قابل رزرو آن ماه است.">
          <NightsChart data={data.monthly} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="الگوی تقاضا در روزهای هفته"
          subtitle="در شمال ایران چهارشنبه تا جمعه پرتقاضاترین شب‌ها هستند."
        >
          <WeekdayChart data={data.weekdayProfile} />
        </Card>

        <Card title="مشخصات اقامتگاه شما">
          <DefinitionList
            items={[
              { term: "نوع", value: owner.propertyType },
              { term: "ظرفیت", value: `${formatNumber(owner.capacity)} (حداکثر ${formatNumber(owner.maxCapacity)})` },
              { term: "اتاق خواب", value: formatNumber(owner.bedrooms) },
              {
                term: "زیربنا / محوطه",
                value: `${formatNumber(owner.floorArea ?? 0)} / ${formatNumber(owner.landArea ?? 0)} متر`,
              },
              {
                term: "تخت‌ها",
                value: `${formatNumber(owner.beds.double)} دونفره + ${formatNumber(owner.beds.mattress)} تشک`,
              },
              { term: "نفر اضافه", value: formatToman(owner.extraGuestFee ?? 0) },
              { term: "تعداد امکانات", value: formatNumber(owner.featuresCount) },
              { term: "تعداد تصاویر", value: formatNumber(owner.picturesCount) },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/8 pt-3">
            {owner.isPlus ? <Chip tone="warning">ممتاز</Chip> : null}
            {owner.isInstant ? <Chip tone="brand">رزرو فوری</Chip> : null}
            {owner.badges.map((badge) => (
              <Chip key={badge} tone="positive">
                {badge}
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      {/* ------------------------------ Market teaser --------------------------- */}
      <Card
        title="جایگاه شما در بازار محلی"
        subtitle={`بر پایه ${formatNumber(market.sampleSize)} اقامتگاه واقعاً مشابه در بابلکنار`}
        action={
          <Link
            href="/market"
            className="no-print text-[11px] font-semibold text-brand-300 hover:text-brand-200"
          >
            تحلیل کامل ←
          </Link>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <PercentileCell
            label="صدک قیمت"
            value={market.pricePercentile}
            caption={`میانه ${formatToman(market.medianPrice)}`}
          />
          <PercentileCell
            label="صدک امتیاز"
            value={market.ratingPercentile}
            caption={`میانه ${formatNumber(market.medianRating, 1)}`}
            tone="positive"
          />
          <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
            <p className="text-[11px] text-slate-400">پر بودن تقویم ۳۰ روز</p>
            <p className="num mt-1 text-lg font-extrabold text-white">
              {market.ownerOccupancy !== null ? formatPercent(market.ownerOccupancy) : "—"}
            </p>
            <Meter value={market.ownerOccupancy ?? 0} tone="warning" />
            <p className="mt-1.5 text-[10px] text-slate-500">
              میانه رقبا{" "}
              {market.medianOccupancy !== null ? formatPercent(market.medianOccupancy) : "—"}
            </p>
          </div>
        </div>
      </Card>

      {/* -------------------------------- Insights ------------------------------ */}
      {data.insights.length ? (
        <Card
          title="مهم‌ترین پیشنهادها"
          action={
            <Link
              href="/insights"
              className="no-print text-[11px] font-semibold text-brand-300 hover:text-brand-200"
            >
              همه پیشنهادها ←
            </Link>
          }
        >
          <ul className="space-y-2">
            {data.insights.slice(0, 4).map((insight) => (
              <li
                key={insight.id}
                className="rounded-xl bg-white/4 px-3.5 py-3 text-[12px] leading-relaxed text-slate-200 ring-1 ring-white/6"
              >
                {insight.title}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive";
}) {
  return (
    <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p
        className={`num mt-1 text-[15px] font-extrabold ${
          tone === "positive" ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PercentileCell({
  label,
  value,
  caption,
  tone = "brand",
}: {
  label: string;
  value: number;
  caption: string;
  tone?: "brand" | "positive";
}) {
  return (
    <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="num mt-1 text-lg font-extrabold text-white">{formatNumber(value)}</p>
      <Meter value={value / 100} tone={tone} />
      <p className="mt-1.5 text-[10px] text-slate-500">{caption}</p>
    </div>
  );
}
