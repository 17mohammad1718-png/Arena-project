import { Suspense } from "react";

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
import { PeriodTabs } from "@/components/period-tabs";
import { Card, Chip, DefinitionList, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { computeExpenseBreakdown, computeWeekdayProfile, upcomingReservations } from "@/lib/analytics";
import { DEMO_TODAY } from "@/lib/demo-data";
import { diffDays, toJalali, toJalaliLong } from "@/lib/dates";
import { loadDataset } from "@/lib/load-dataset";
import {
  computeKpis,
  computeMarketPosition,
  computeMonthlySeries,
  formatNumber,
  formatPercent,
  formatToman,
} from "@/lib/metrics";
import { isPeriodKey, previousPeriod, resolvePeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const periodKey = isPeriodKey(params.period) ? params.period : "last12";

  const dataset = loadDataset();
  const today = dataset.origin === "demo" ? DEMO_TODAY : undefined;
  const period = resolvePeriod(periodKey, dataset.range, today);
  const previous = previousPeriod(period, dataset.range);

  const kpis = computeKpis(dataset, period);
  const priorKpis = previous ? computeKpis(dataset, previous) : null;
  const monthly = computeMonthlySeries(dataset, period);
  const market = computeMarketPosition(dataset.property, dataset.competitors);
  const weekdayProfile = computeWeekdayProfile(dataset, period);
  const expenses = computeExpenseBreakdown(dataset, period);
  const upcoming = upcomingReservations(dataset, today ?? new Date().toISOString().slice(0, 10));

  const delta = (current: number, prior: number | undefined) => {
    if (prior === undefined || prior === 0) return null;
    const change = (current - prior) / Math.abs(prior);
    if (!Number.isFinite(change) || Math.abs(change) < 0.005) return null;
    return { value: formatPercent(Math.abs(change)), positive: change > 0 };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="نمای کلی عملکرد"
        description={`بازه تحلیل: ${toJalaliLong(period.start)} تا ${toJalaliLong(period.end)} — ${formatNumber(
          diffDays(period.start, period.end) + 1,
        )} شب`}
        action={
          <Suspense fallback={null}>
            <PeriodTabs active={periodKey} />
          </Suspense>
        }
      />

      {dataset.origin !== "real" ? (
        <Notice tone="warning" title="این ارقام بر پایه داده نمایشی است">
          دیتاست واقعی هنوز کامل بارگذاری نشده است. کافی است فایل‌های خود را در پوشه{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">data/</code> قرار
          دهید تا همین صفحه با ارقام واقعی بازسازی شود. جزئیات در صفحه «منبع داده».
        </Notice>
      ) : null}

      {/* --------------------------------- KPIs -------------------------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          label="درآمد ناخالص"
          value={formatToman(kpis.grossRevenue)}
          icon={<IconMoney className="size-4" />}
          delta={delta(kpis.grossRevenue, priorKpis?.grossRevenue)}
          hint="پیش از کارمزد و هزینه"
          tone="brand"
        />
        <KpiCard
          label="سود خالص"
          value={formatToman(kpis.netProfit)}
          icon={<IconTrend className="size-4" />}
          delta={delta(kpis.netProfit, priorKpis?.netProfit)}
          hint={`کارمزد ${formatToman(kpis.platformFees)}`}
          tone={kpis.netProfit > 0 ? "positive" : "warning"}
        />
        <KpiCard
          label="نرخ اشغال"
          value={formatPercent(kpis.occupancyRate)}
          icon={<IconPercent className="size-4" />}
          delta={delta(kpis.occupancyRate, priorKpis?.occupancyRate)}
          hint={`${formatNumber(kpis.bookedNights)} از ${formatNumber(kpis.availableNights)} شب`}
        />
        <KpiCard
          label="میانگین نرخ شبانه"
          value={formatToman(kpis.adr)}
          icon={<IconBed className="size-4" />}
          delta={delta(kpis.adr, priorKpis?.adr)}
          hint="ADR"
        />
        <KpiCard
          label="درآمد هر شب قابل رزرو"
          value={formatToman(kpis.revpan)}
          icon={<IconTrend className="size-4" />}
          delta={delta(kpis.revpan, priorKpis?.revpan)}
          hint="RevPAN"
        />
        <KpiCard
          label="تعداد رزرو"
          value={formatNumber(kpis.reservationsCount)}
          icon={<IconNights className="size-4" />}
          delta={delta(kpis.reservationsCount, priorKpis?.reservationsCount)}
          hint={`میانگین ${formatNumber(kpis.avgStayLength, 1)} شب`}
        />
        <KpiCard
          label="نرخ لغو"
          value={formatPercent(kpis.cancellationRate)}
          icon={<IconStar className="size-4" />}
          hint={`${formatNumber(kpis.cancelledCount)} رزرو لغوشده`}
          tone={kpis.cancellationRate > 0.12 ? "warning" : "default"}
        />
        <KpiCard
          label="نرخ تبدیل بازدید"
          value={kpis.conversionRate === null ? "بدون داده" : formatPercent(kpis.conversionRate, 2)}
          icon={<IconGuests className="size-4" />}
          hint={kpis.views > 0 ? `${formatNumber(kpis.views)} بازدید` : "نیازمند داده پنل میزبان"}
        />
      </div>

      {/* -------------------------------- Charts ------------------------------- */}
      <Card
        title="روند درآمد، سود و نرخ اشغال"
        subtitle="ستون بنفش سود خالص، ناحیه فیروزه‌ای درآمد ناخالص و خط زرد نرخ اشغال هر ماه است."
      >
        <RevenueTrendChart data={monthly} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="نرخ شبانه در برابر بازده واقعی"
          subtitle="فاصله ADR و RevPAN نشان می‌دهد چه مقدار از ظرفیت شما فروش نرفته است."
        >
          <RateChart data={monthly} />
        </Card>
        <Card title="شب‌های رزروشده و خالی" subtitle="هر ستون کل شب‌های قابل رزرو آن ماه است.">
          <NightsChart data={monthly} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="الگوی تقاضا در روزهای هفته"
          subtitle="در شمال ایران چهارشنبه تا جمعه معمولاً پرتقاضاترین شب‌ها هستند."
        >
          <WeekdayChart data={weekdayProfile} />
        </Card>

        <Card title="ترکیب هزینه‌ها" subtitle="بر پایه هزینه‌های ثبت‌شده در همین بازه.">
          {expenses.length ? (
            <div className="space-y-3">
              {expenses.map((item) => (
                <div key={item.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-slate-300">{item.category}</span>
                    <span className="num text-[12px] font-semibold text-slate-100">
                      {formatToman(item.amount)}
                    </span>
                  </div>
                  <Meter value={item.share} tone="warning" />
                </div>
              ))}
              <div className="mt-4 flex items-baseline justify-between border-t border-white/8 pt-3">
                <span className="text-[12px] font-bold text-slate-200">مجموع هزینه</span>
                <span className="num text-[13px] font-extrabold text-amber-300">
                  {formatToman(kpis.expenses)}
                </span>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              هزینه‌ای برای این بازه ثبت نشده است.
            </p>
          )}
        </Card>
      </div>

      {/* ----------------------------- Summary rows ---------------------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="خلاصه عملیاتی بازه">
          <DefinitionList
            items={[
              { term: "کل شب‌های بازه", value: formatNumber(kpis.totalNights) },
              { term: "شب‌های قابل رزرو", value: formatNumber(kpis.availableNights) },
              { term: "شب‌های رزروشده", value: formatNumber(kpis.bookedNights) },
              { term: "شب‌های مسدودشده توسط میزبان", value: formatNumber(kpis.blockedNights) },
              { term: "میانگین مدت اقامت", value: `${formatNumber(kpis.avgStayLength, 1)} شب` },
              { term: "میانگین تعداد مهمان", value: formatNumber(kpis.avgGuests, 1) },
              { term: "میانگین نرخ آخر هفته", value: formatToman(kpis.weekendAdr) },
              { term: "میانگین نرخ وسط هفته", value: formatToman(kpis.weekdayAdr) },
            ]}
          />
        </Card>

        <Card
          title="رزروهای پیش رو"
          subtitle={
            upcoming.length
              ? "شب‌های نزدیک که هنوز فرصت اصلاح قیمت دارند در تقویم قیمت قابل بررسی‌اند."
              : undefined
          }
        >
          {upcoming.length ? (
            <ul className="space-y-2.5">
              {upcoming.map((reservation) => {
                const nights = diffDays(reservation.checkIn, reservation.checkOut);
                return (
                  <li
                    key={reservation.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2.5 ring-1 ring-white/6"
                  >
                    <div className="min-w-0">
                      <p className="num text-[12px] font-semibold text-slate-100">
                        {toJalali(reservation.checkIn)} ← {toJalali(reservation.checkOut)}
                      </p>
                      <p className="num mt-0.5 text-[11px] text-slate-500">
                        {formatNumber(nights)} شب · {formatNumber(reservation.guests)} مهمان
                      </p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="num text-[12px] font-bold text-brand-200">
                        {formatToman(reservation.grossAmount)}
                      </p>
                      <Chip tone={reservation.status === "upcoming" ? "brand" : "neutral"}>
                        {reservation.status === "upcoming" ? "پیش رو" : "انجام‌شده"}
                      </Chip>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              رزرو ثبت‌شده‌ای برای روزهای آینده وجود ندارد.
            </p>
          )}
        </Card>
      </div>

      {/* ------------------------------ Market teaser --------------------------- */}
      <Card
        title="جایگاه شما در بازار محلی"
        subtitle={`بر پایه ${formatNumber(market.sampleSize)} اقامتگاه مشابه در ${dataset.property.city} و اطراف`}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
            <p className="text-[11px] text-slate-400">صدک قیمت روز عادی</p>
            <p className="num mt-1 text-lg font-extrabold text-white">
              {formatNumber(market.weekdayPercentile)}
            </p>
            <Meter value={market.weekdayPercentile / 100} />
            <p className="mt-1.5 text-[10px] text-slate-500">
              میانه بازار {formatToman(market.medianWeekday)}
            </p>
          </div>
          <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
            <p className="text-[11px] text-slate-400">صدک قیمت آخر هفته</p>
            <p className="num mt-1 text-lg font-extrabold text-white">
              {formatNumber(market.weekendPercentile)}
            </p>
            <Meter value={market.weekendPercentile / 100} tone="warning" />
            <p className="mt-1.5 text-[10px] text-slate-500">
              میانه بازار {formatToman(market.medianWeekend)}
            </p>
          </div>
          <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
            <p className="text-[11px] text-slate-400">صدک امتیاز</p>
            <p className="num mt-1 text-lg font-extrabold text-white">
              {formatNumber(market.ratingPercentile)}
            </p>
            <Meter value={market.ratingPercentile / 100} tone="positive" />
            <p className="mt-1.5 text-[10px] text-slate-500">
              میانه امتیاز رقبا {formatNumber(market.medianRating, 1)}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
