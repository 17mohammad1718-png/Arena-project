import { Suspense } from "react";

import { MonthNav } from "@/components/month-nav";
import { Card, Chip, KpiCard, Notice, PageHeader } from "@/components/ui";
import { SEASON_LABEL, WEEKDAY_SHORT, jalaliParts, toJalaliLong } from "@/lib/dates";
import { getDataset } from "@/lib/jajiga/dataset";
import { buildCalendarMonth, summarizeCalendar } from "@/lib/jajiga/pricing";
import type { CalendarDay } from "@/lib/jajiga/pricing";
import { formatNumber, formatPercent, formatToman, formatTomanShort } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "تقویم قیمت" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const data = getDataset();

  if (data.isEmpty) {
    return <Notice tone="warning">تقویمی برای نمایش موجود نیست.</Notice>;
  }

  const today = data.today;
  const current = jalaliParts(today);
  const year = Number(params.year) || current.year;
  const month = Math.min(Math.max(Number(params.month) || current.month, 1), 12);

  const days = buildCalendarMonth(
    data.calendar,
    data.marketNights,
    { rating: data.owner.rating, fallbackMedian: data.market.medianPrice },
    year,
    month,
    today,
  );
  const summary = summarizeCalendar(days);

  const leadingBlanks = days.length ? days[0].weekday : 0;
  const trackedShare = days.length ? summary.trackedNights / days.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقویم قیمت شبانه"
        description="نرخ واقعی شما در هر شب، در برابر میانه نرخ همان شب نزد رقبای مشابه."
        action={
          <Suspense fallback={null}>
            <MonthNav year={year} month={month} />
          </Suspense>
        }
      />

      <Notice>
        قیمت مرجع هر شب از <strong>میانه نرخ واقعی رقبا برای همان تاریخ</strong> ساخته شده است، نه از
        یک فرمول ثابت؛ بنابراین اثر آخر هفته و فصل از پیش در آن لحاظ شده. تقویم رصد فقط شب‌های آینده
        را پوشش می‌دهد و تعطیلات قمری در تقویم تعطیلات نیست.
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="شب‌های رزروشده این ماه"
          value={formatNumber(summary.bookedNights)}
          hint={`${formatNumber(summary.openNights)} شب باز · ${formatNumber(
            summary.blockedNights,
          )} شب بسته`}
        />
        <KpiCard
          label="نرخ اشغال ماه"
          value={formatPercent(summary.occupancy)}
          hint={
            summary.bookedRevenue > 0
              ? `درآمد قطعی‌شده ${formatToman(summary.bookedRevenue)}`
              : "هنوز رزروی برای این ماه نیست"
          }
          tone={summary.occupancy < 0.2 ? "warning" : "positive"}
        />
        <KpiCard
          label="میانگین نرخ شما"
          value={summary.avgPrice > 0 ? formatToman(summary.avgPrice) : "—"}
          hint={`میانه بازار ${formatToman(summary.avgMarketPrice)}`}
          tone="brand"
        />
        <KpiCard
          label="شب‌های زیر قیمت"
          value={formatNumber(summary.underpricedNights)}
          hint={
            summary.potentialUplift > 0
              ? `ظرفیت افزایش ${formatToman(summary.potentialUplift)}`
              : `${formatNumber(summary.overpricedNights)} شب بالای بازار`
          }
          tone={summary.underpricedNights > 0 ? "warning" : "default"}
        />
      </div>

      {trackedShare < 0.99 ? (
        <Notice tone="warning">
          {formatNumber(summary.trackedNights)} شب از {formatNumber(days.length)} شب این ماه در بازه
          رصد قرار دارد. بقیه شب‌ها یا گذشته‌اند یا هنوز در تقویم رصد ثبت نشده‌اند و کم‌رنگ نمایش داده
          می‌شوند.
        </Notice>
      ) : null}

      <Card
        title={`تقویم ${toJalaliLong(days[0]?.date ?? today).split(" ").slice(1).join(" ")}`}
        subtitle="سبز: رزروشده · خاکستری: بسته توسط شما · روشن: قابل رزرو"
      >
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAY_SHORT.map((label, index) => (
            <div
              key={label}
              className={`pb-1.5 text-[11px] font-bold ${
                index >= 4 ? "text-amber-300/80" : "text-slate-500"
              }`}
            >
              {label}
            </div>
          ))}

          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} />
          ))}

          {days.map((day) => (
            <DayCell key={day.date} day={day} today={today} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-3 text-[10px] text-slate-500">
          <LegendDot className="bg-emerald-400/70" label="رزروشده" />
          <LegendDot className="bg-slate-500/70" label="بسته توسط شما" />
          <LegendDot className="bg-white/15" label="قابل رزرو" />
          <LegendDot className="bg-amber-400/70" label="زیر نرخ بازار" />
          <LegendDot className="bg-rose-400/70" label="بالای نرخ بازار" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card
          title="شب‌هایی که بیشترین فرصت را دارند"
          subtitle="شب‌های باز آینده که نرخ شما زیر کف بازه پیشنهادی است."
        >
          <OpportunityTable days={days} />
        </Card>

        <Card title="تعطیلات و فصل تقاضا">
          {summary.holidays.length ? (
            <ul className="mb-4 space-y-2">
              {summary.holidays.map((holiday) => (
                <li
                  key={holiday.date}
                  className="flex items-center justify-between rounded-lg bg-amber-400/8 px-3 py-2 text-[12px] ring-1 ring-amber-400/20"
                >
                  <span className="text-amber-200">{holiday.name}</span>
                  <span className="num text-[11px] text-slate-400">
                    {toJalaliLong(holiday.date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-[12px] text-slate-500">
              تعطیلی رسمی ثابتی در این ماه ثبت نشده است.
            </p>
          )}

          <div className="space-y-2 border-t border-white/8 pt-3">
            {(["high", "mid", "low"] as const).map((season) => {
              const count = days.filter((d) => d.season === season).length;
              if (!count) return null;
              return (
                <div key={season} className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-300">{SEASON_LABEL[season]}</span>
                  <span className="num text-slate-400">{formatNumber(count)} شب</span>
                </div>
              );
            })}
          </div>

          <p className="mt-4 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
            ضریب کیفیت شما بر پایه امتیاز {formatNumber(data.owner.rating ?? 0, 1)} محاسبه شده است.
            هرچه سهم شب‌های پرشده در بازار بالاتر برود، بازه پیشنهادی هم بالاتر می‌رود.
          </p>
        </Card>
      </div>
    </div>
  );
}

function DayCell({ day, today }: { day: CalendarDay; today: string }) {
  const base =
    "relative rounded-lg p-1.5 text-center ring-1 transition min-h-[62px] flex flex-col justify-between";

  const stateClass =
    day.state === "booked"
      ? "bg-emerald-400/14 ring-emerald-400/30"
      : day.state === "blocked"
        ? "bg-slate-500/12 ring-white/8"
        : day.state === "open"
          ? "bg-white/4 ring-white/8"
          : "bg-transparent ring-white/5";

  // Nights before today carry no decision, and nights outside the radar window
  // have no observed price — neither should compete for attention.
  const dimmed = day.isPast || !day.isTracked;

  const priceTone =
    day.verdict === "underpriced"
      ? "text-amber-300"
      : day.verdict === "overpriced"
        ? "text-rose-300"
        : day.state === "booked"
          ? "text-emerald-200"
          : "text-slate-300";

  const isToday = day.date === today;

  return (
    <div
      className={`${base} ${stateClass} ${isToday ? "ring-2 ring-brand-400/60" : ""} ${
        dimmed ? "opacity-45" : ""
      }`}
      title={
        dimmed
          ? `${toJalaliLong(day.date)}${day.holiday ? ` — ${day.holiday}` : ""} — خارج از بازه رصد`
          : `${toJalaliLong(day.date)}${day.holiday ? ` — ${day.holiday}` : ""} · بازار ${formatToman(
              day.market,
            )} · پیشنهاد ${formatToman(day.suggestedMin)} تا ${formatToman(day.suggestedMax)}`
      }
    >
      <div className="flex items-start justify-between">
        <span
          className={`num text-[11px] font-bold ${
            day.isWeekend ? "text-amber-300" : "text-slate-300"
          }`}
        >
          {formatNumber(day.jalaliDay)}
        </span>
        {day.holiday ? <span className="size-1.5 rounded-full bg-amber-400" /> : null}
      </div>

      {day.effectivePrice !== null ? (
        <span className={`num block text-[10px] font-bold ${priceTone}`}>
          {formatTomanShort(day.effectivePrice)}
        </span>
      ) : (
        <span className="text-[9px] text-slate-600">—</span>
      )}

      {dimmed ? (
        <span className="text-[9px] text-slate-600">&nbsp;</span>
      ) : (
        <span className="num block text-[9px] text-slate-500">{formatTomanShort(day.market)}</span>
      )}
    </div>
  );
}

function OpportunityTable({ days }: { days: CalendarDay[] }) {
  const rows = days
    .filter(
      (day) =>
        !day.isPast &&
        day.state === "open" &&
        day.effectivePrice !== null &&
        day.effectivePrice < day.suggestedMin,
    )
    .sort((a, b) => b.suggestedMin - (b.effectivePrice ?? 0) - (a.suggestedMin - (a.effectivePrice ?? 0)))
    .slice(0, 10);

  if (!rows.length) {
    return (
      <p className="py-8 text-center text-[12px] text-slate-500">
        نرخ شما در شب‌های باز این ماه پایین‌تر از بازه پیشنهادی نیست.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-right text-[12px]">
        <thead>
          <tr className="border-b border-white/8 text-[11px] text-slate-500">
            <th className="py-2 font-semibold">شب</th>
            <th className="py-2 font-semibold">نرخ شما</th>
            <th className="py-2 font-semibold">بازار</th>
            <th className="py-2 font-semibold">پیشنهاد</th>
            <th className="py-2 font-semibold">اختلاف</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => (
            <tr key={day.date} className="border-b border-white/5 last:border-0">
              <td className="py-2 text-slate-300">
                {toJalaliLong(day.date)}
                {day.isWeekend ? (
                  <Chip tone="warning" className="mr-1.5">
                    آخر هفته
                  </Chip>
                ) : null}
              </td>
              <td className="num py-2 text-slate-200">{formatTomanShort(day.effectivePrice ?? 0)}</td>
              <td className="num py-2 text-slate-400">{formatTomanShort(day.market)}</td>
              <td className="num py-2 text-brand-300">{formatTomanShort(day.suggestedMin)}</td>
              <td className="num py-2 font-semibold text-amber-300">
                +{formatTomanShort(day.suggestedMin - (day.effectivePrice ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
