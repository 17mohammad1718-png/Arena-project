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
import path from "node:path";

import { AlertsPanel } from "@/components/alerts-panel";
import { Card, Chip, DefinitionList, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { buildAlerts } from "@/lib/alerts";
import { jalaliMonthEnd, jalaliMonthStart, jalaliParts, toJalaliLong, toJalaliMonthLabel } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { listAlerts, logAlert } from "@/lib/db/market";
import { listExpenses, reservationsInRange } from "@/lib/db/repo";
import { computeProfit, mergeRevenueNights } from "@/lib/finance";
import { getDataset } from "@/lib/jajiga/dataset";
import { OWNER_ROOM_ID } from "@/lib/jajiga/load";
import { buildCalendarMonth } from "@/lib/jajiga/pricing";
import { marketOccupancyTrend, priceChangesBetweenCaptures } from "@/lib/market-trends";
import { computeSupplyTrend, loadSupplySnapshots } from "@/lib/supply";
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

  // Real profit for the current Jalali month: market calendar + host records.
  const currentParts = jalaliParts(data.today);
  const monthFrom = jalaliMonthStart(currentParts.year, currentParts.month);
  const monthTo = jalaliMonthEnd(currentParts.year, currentParts.month);
  const db = getDb();
  const monthProfit = computeProfit(
    mergeRevenueNights(
      data.calendar,
      reservationsInRange(db, monthFrom, monthTo),
      monthFrom,
      monthTo,
    ),
    listExpenses(db, monthFrom, monthTo),
  );
  const monthLabel = toJalaliMonthLabel(monthFrom);

  // N4: time-aware alerts. Rules run on today's data; alert_log dedups per
  // day and remembers dismissals.
  const nextMonth = jalaliParts(data.today).month === 12
    ? { year: currentParts.year + 1, month: 1 }
    : { year: currentParts.year, month: currentParts.month + 1 };
  const alertDays = [
    ...buildCalendarMonth(
      data.calendar, data.marketNights, { rating: owner.rating },
      currentParts.year, currentParts.month, data.today,
    ),
    ...buildCalendarMonth(
      data.calendar, data.marketNights, { rating: owner.rating },
      nextMonth.year, nextMonth.month, data.today,
    ),
  ];
  const candidateAlerts = buildAlerts({
    today: data.today,
    calendarDays: alertDays,
    ownerOccupancy: data.market.ownerOccupancy,
    peerMedianOccupancy: data.market.medianOccupancy,
    peerCount: data.market.sampleSize,
    priceChanges: priceChangesBetweenCaptures(db),
    competitorTitles: new Map(data.competitors.map((room) => [room.id, room.title])),
    supplyTrend: computeSupplyTrend(
      loadSupplySnapshots(path.join(process.cwd(), "data")).snapshots,
    ),
    occupancyTrend: marketOccupancyTrend(db, OWNER_ROOM_ID),
  });

  // Log today's firings (no-op when already logged), then show only alerts
  // that are recorded for today and not dismissed.
  for (const alert of candidateAlerts) {
    logAlert(db, alert.ruleKey, data.today, alert.payload);
  }
  const todayLog = listAlerts(db, data.today);
  const activeKeys = new Set(
    todayLog.filter((entry) => !entry.dismissed).map((entry) => entry.ruleKey),
  );
  const alerts = candidateAlerts.filter((alert) => activeKeys.has(alert.ruleKey));
  const alertIds = Object.fromEntries(
    todayLog.map((entry) => [entry.ruleKey, entry.id]),
  );

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

      <AlertsPanel alerts={alerts} ids={alertIds} />

      {data.ownerRate && data.ownerRate.weekday !== owner.basePrice ? (
        <Notice tone="warning" title="نرخ کارت آگهی با نرخ تقویم شما یکی نیست">
          روی کارت آگهی «از {formatToman(owner.basePrice)}» نوشته شده، اما نرخی که واقعاً در
          تقویم گذاشته‌اید {formatToman(data.ownerRate.weekday)} برای شب‌های عادی و{" "}
          {formatToman(data.ownerRate.weekend)} برای آخر هفته است. همه تحلیل‌های این داشبورد بر
          پایه نرخ واقعی تقویم انجام می‌شود، چون همان چیزی است که مهمان پرداخت می‌کند.
        </Notice>
      ) : null}

      <Notice title="این تقویم فقط آینده را نشان می‌دهد">
        جاجیگا تاریخچه رزروهای گذشته را در دسترس قرار نمی‌دهد. شاخص‌های زیر بر پایه{" "}
        <strong>شب‌های پیش رو</strong> محاسبه شده‌اند، بنابراین نرخ اشغال پایین برای ماه‌های دور
        طبیعی است. درآمد محقق‌شده فقط برای بازه کوتاهی که پایپ‌لاین ثبت کرده موجود است.
      </Notice>

      {/* --------------------------------- KPIs -------------------------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          label={data.ownerRate ? "نرخ واقعی تقویم (روز عادی)" : "نرخ پایه فعلی"}
          value={formatToman(data.ownerRate?.weekday ?? owner.basePrice)}
          icon={<IconMoney className="size-4" />}
          hint={
            data.ownerRate && data.marketRate
              ? `میانه واقعی رقبا ${formatToman(data.marketRate.weekday)}`
              : `میانه رقبا ${formatToman(market.medianPrice)}`
          }
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

      {/* ------------------------------ Real profit ----------------------------- */}
      <Card
        title={`سود واقعی ${monthLabel}`}
        subtitle="درآمد − کمیسیون ۱۲٪ − هزینه‌های ثبت‌شده شما"
        action={
          <Link
            href="/finance"
            className="no-print text-[11px] font-semibold text-brand-300 hover:text-brand-200"
          >
            ثبت هزینه و جزئیات ←
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="درآمد ناخالص ماه" value={formatToman(monthProfit.grossRevenue)} />
          <MiniStat label="کمیسیون جاجیگا" value={formatToman(monthProfit.commission)} />
          <MiniStat label="هزینه‌های ثبت‌شده" value={formatToman(monthProfit.totalExpenses)} />
          <MiniStat
            label="سود واقعی"
            value={formatToman(monthProfit.realProfit)}
            tone={monthProfit.realProfit >= 0 ? "positive" : undefined}
          />
        </div>
        {monthProfit.totalExpenses === 0 ? (
          <p className="mt-3 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
            هنوز هزینه‌ای برای این ماه ثبت نکرده‌اید؛ تا وقتی هزینه‌ها ثبت نشوند، «سود واقعی» همان
            درآمد خالص است. از صفحه «مالی من» شروع کنید.
          </p>
        ) : null}
      </Card>

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
          subtitle="ستون‌ها سهم پرشده شب‌های رقبا در هر روز هفته است؛ خط بنفش نرخ خود شماست."
        >
          <WeekdayChart data={data.marketWeekday} />
          <p className="mt-3 rounded-lg bg-white/4 p-2.5 text-[11px] leading-relaxed text-slate-400">
            چون تنها {formatNumber(data.calendarKpis.bookedNights)} شب از تقویم شما رزرو شده،
            الگوی تقاضا از کل بازار رصدشده محاسبه شده است تا معنادار باشد.
          </p>
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
