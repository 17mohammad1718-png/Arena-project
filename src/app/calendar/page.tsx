import { Suspense } from "react";

import { CalendarGrid } from "@/components/calendar-grid";
import type { HostNightInfo, InteractiveDay } from "@/components/calendar-grid";
import { MonthNav } from "@/components/month-nav";
import { Card, Chip, KpiCard, Notice, PageHeader } from "@/components/ui";
import { SEASON_LABEL, jalaliParts, toJalaliLong } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { listBlocks, reservationNights } from "@/lib/db/repo";
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

  const baseDays = buildCalendarMonth(
    data.calendar,
    data.marketNights,
    { rating: data.owner.rating },
    year,
    month,
    today,
  );

  // Merge host records (plan M3): manual reservations and blocks from the
  // local database override the radar inference for the nights they cover.
  const db = getDb();
  const monthFrom = baseDays[0]?.date ?? today;
  const monthTo = baseDays[baseDays.length - 1]?.date ?? today;
  const hostBlocks = new Map(listBlocks(db, monthFrom, monthTo).map((b) => [b.date, b]));
  const hostReservations = reservationNights(db, monthFrom, monthTo);

  const days: InteractiveDay[] = baseDays.map((day) => {
    const block = hostBlocks.get(day.date);
    const reservation = hostReservations.get(day.date);
    const host: HostNightInfo = {
      hostBlocked: block !== undefined,
      blockReason: block?.reason ?? "",
      reservationId: reservation?.id ?? null,
      reservationNote: reservation?.note ?? "",
    };

    let merged: CalendarDay = day;
    if (reservation) {
      const stayNights = Math.max(
        1,
        Math.round(
          (Date.parse(reservation.checkOut) - Date.parse(reservation.checkIn)) / 86_400_000,
        ),
      );
      const perNight = Math.round(
        (reservation.grossAmount - reservation.discountAmount) / stayNights,
      );
      merged = { ...day, state: "booked", effectivePrice: perNight, isTracked: true };
    } else if (block) {
      merged = { ...day, state: "blocked", isTracked: true };
    }
    return { ...merged, host };
  });

  const summary = summarizeCalendar(days);
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
        subtitle="روی هر شب آینده کلیک کنید: بستن شب یا ثبت رزرو واقعی. رزرو ثبت‌شده شما بر استنباط رادار مقدم است."
      >
        <CalendarGrid days={days} today={today} />
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

function OpportunityTable({ days }: { days: CalendarDay[] }) {
  const rows = days
    .filter(
      (day) =>
        !day.isPast &&
        day.state === "open" &&
        day.effectivePrice !== null &&
        day.suggestedMin !== null &&
        day.effectivePrice < day.suggestedMin,
    )
    .sort(
      (a, b) =>
        (b.suggestedMin ?? 0) -
        (b.effectivePrice ?? 0) -
        ((a.suggestedMin ?? 0) - (a.effectivePrice ?? 0)),
    )
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
              <td className="num py-2 text-slate-400">{formatTomanShort(day.market ?? 0)}</td>
              <td className="num py-2 text-brand-300">{formatTomanShort(day.suggestedMin ?? 0)}</td>
              <td className="num py-2 font-semibold text-amber-300">
                +{formatTomanShort((day.suggestedMin ?? 0) - (day.effectivePrice ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
