import { Suspense } from "react";

import { MonthNav } from "@/components/month-nav";
import { Card, Chip, KpiCard, Notice, PageHeader } from "@/components/ui";
import { DEMO_TODAY } from "@/lib/demo-data";
import { SEASON_LABEL, WEEKDAY_SHORT, jalaliParts, toISO, toJalaliLong } from "@/lib/dates";
import { loadDataset } from "@/lib/load-dataset";
import { formatNumber, formatPercent, formatToman, formatTomanShort } from "@/lib/metrics";
import { buildCalendarMonth, summarizeCalendar } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export const metadata = { title: "تقویم قیمت" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const dataset = loadDataset();
  const today = dataset.origin === "demo" ? DEMO_TODAY : toISO(new Date());

  const current = jalaliParts(today);
  const year = Number(params.year) || current.year;
  const month = Math.min(Math.max(Number(params.month) || current.month, 1), 12);

  const days = buildCalendarMonth(dataset, year, month, today);
  const summary = summarizeCalendar(days);

  // Pad the grid so the first day lands under the correct weekday column.
  const leadingBlanks = days.length ? days[0].weekday : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقویم قیمت شبانه"
        description="مقایسه نرخ شما با برآورد بازار برای هر شب، همراه با تعطیلات رسمی و فصل تقاضا."
        action={
          <Suspense fallback={null}>
            <MonthNav year={year} month={month} />
          </Suspense>
        }
      />

      <Notice>
        قیمت پیشنهادی یک <strong>برآورد</strong> بر پایه میانه رقبای مشابه، اثر آخر هفته، فصل تقاضا و
        تعطیلات رسمی است. تقویم تعطیلات فقط شامل تعطیلات ثابت شمسی است و تعطیلات قمری در آن لحاظ
        نشده‌اند.
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="نرخ اشغال این ماه"
          value={formatPercent(summary.occupancy)}
          hint={`${formatNumber(summary.bookedNights)} شب رزروشده`}
          tone="brand"
        />
        <KpiCard
          label="شب‌های خالی"
          value={formatNumber(summary.openNights)}
          hint={`${formatNumber(summary.blockedNights)} شب مسدودشده`}
        />
        <KpiCard
          label="میانگین نرخ شما"
          value={formatToman(summary.avgPrice)}
          hint={`برآورد بازار ${formatToman(summary.avgMarketPrice)}`}
        />
        <KpiCard
          label="شب‌های زیر نرخ بازار"
          value={formatNumber(summary.underpricedNights)}
          hint={
            summary.potentialUplift > 0
              ? `تا ${formatToman(summary.potentialUplift)} فرصت افزایش`
              : "بدون فاصله معنادار"
          }
          tone={summary.underpricedNights > 4 ? "warning" : "default"}
        />
      </div>

      {/* ------------------------------- Calendar ------------------------------ */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
          <LegendDot className="bg-brand-500/60" label="رزروشده" />
          <LegendDot className="bg-slate-600/70" label="مسدود توسط میزبان" />
          <LegendDot className="bg-white/8" label="خالی" />
          <LegendDot className="bg-rose-500/60" label="تعطیل رسمی" />
          <span className="text-slate-500">↓ زیر نرخ بازار</span>
          <span className="text-slate-500">↑ بالای نرخ بازار</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAY_SHORT.map((day, i) => (
            <div
              key={day}
              className={`pb-1.5 text-[11px] font-bold ${i >= 4 ? "text-brand-300" : "text-slate-500"}`}
            >
              {day}
            </div>
          ))}

          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}

          {days.map((day) => {
            const stateStyle =
              day.state === "booked"
                ? "bg-brand-500/14 ring-brand-400/30"
                : day.state === "blocked"
                  ? "bg-slate-700/40 ring-slate-500/25"
                  : "bg-white/4 ring-white/8";

            const gapBadge =
              day.gap === null
                ? null
                : day.gap < -0.1
                  ? { icon: "↓", className: "text-amber-300" }
                  : day.gap > 0.15
                    ? { icon: "↑", className: "text-rose-300" }
                    : null;

            return (
              <div
                key={day.date}
                className={`relative flex min-h-24 flex-col justify-between rounded-lg p-1.5 text-right ring-1 transition hover:ring-brand-400/40 ${stateStyle} ${
                  day.isPast ? "opacity-55" : ""
                }`}
                title={`${toJalaliLong(day.date)} — ${SEASON_LABEL[day.season]}${
                  day.holiday ? ` — ${day.holiday}` : ""
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`num text-[13px] font-bold ${
                      day.holiday ? "text-rose-300" : day.isWeekend ? "text-brand-200" : "text-slate-200"
                    }`}
                  >
                    {formatNumber(day.jalaliDay)}
                  </span>
                  {gapBadge ? (
                    <span className={`text-[11px] font-bold ${gapBadge.className}`}>
                      {gapBadge.icon}
                    </span>
                  ) : null}
                </div>

                {day.holiday ? (
                  <span className="truncate text-[9px] font-semibold text-rose-300/90">
                    {day.holiday}
                  </span>
                ) : null}

                <div className="mt-auto space-y-0.5">
                  {day.price !== undefined ? (
                    <p className="num text-[11px] font-bold text-slate-100">
                      {formatTomanShort(day.price)}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-600">بدون نرخ</p>
                  )}
                  <p className="num text-[9px] text-slate-500">
                    بازار {formatTomanShort(day.marketPrice)}
                  </p>
                  {!day.isPast && day.state === "open" ? (
                    <p className="num text-[9px] text-emerald-400/80">
                      {formatTomanShort(day.suggestedMin)}–{formatTomanShort(day.suggestedMax)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ------------------------------- Holidays ------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="تعطیلات و مناسبت‌های این ماه" subtitle="فقط تعطیلات ثابت تقویم شمسی">
          {summary.holidays.length ? (
            <ul className="space-y-2">
              {summary.holidays.map((holiday) => (
                <li
                  key={holiday.date}
                  className="flex items-center justify-between gap-3 rounded-xl bg-rose-500/8 px-3 py-2.5 ring-1 ring-rose-500/20"
                >
                  <span className="text-[12px] font-semibold text-rose-100">{holiday.name}</span>
                  <span className="num text-[11px] text-rose-200/80">
                    {toJalaliLong(holiday.date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              تعطیلات رسمی ثابتی در این ماه ثبت نشده است.
            </p>
          )}
        </Card>

        <Card
          title="شب‌های نیازمند بازبینی قیمت"
          subtitle="شب‌های آینده‌ای که هنوز خالی‌اند و نرخشان زیر کف پیشنهادی است."
        >
          {(() => {
            const candidates = days
              .filter(
                (d) =>
                  !d.isPast &&
                  d.state === "open" &&
                  d.price !== undefined &&
                  d.price < d.suggestedMin,
              )
              .slice(0, 8);

            if (!candidates.length) {
              return (
                <p className="py-8 text-center text-[12px] text-slate-500">
                  شب خالی با قیمت پایین‌تر از کف پیشنهادی در این ماه وجود ندارد.
                </p>
              );
            }

            return (
              <ul className="space-y-2">
                {candidates.map((day) => (
                  <li
                    key={day.date}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/4 px-3 py-2.5 ring-1 ring-white/6"
                  >
                    <div>
                      <p className="num text-[12px] font-semibold text-slate-100">
                        {toJalaliLong(day.date)}
                      </p>
                      <div className="mt-1 flex gap-1.5">
                        <Chip tone={day.isWeekend ? "brand" : "neutral"}>
                          {day.isWeekend ? "آخر هفته" : "وسط هفته"}
                        </Chip>
                        <Chip tone={day.season === "high" ? "warning" : "neutral"}>
                          {SEASON_LABEL[day.season]}
                        </Chip>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="num text-[11px] text-slate-400">
                        فعلی {formatToman(day.price ?? 0)}
                      </p>
                      <p className="num text-[12px] font-bold text-emerald-300">
                        پیشنهاد {formatTomanShort(day.suggestedMin)}–{formatTomanShort(day.suggestedMax)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </Card>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded ${className}`} />
      {label}
    </span>
  );
}
