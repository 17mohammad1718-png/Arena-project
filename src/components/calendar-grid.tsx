"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { parseJalaliInput, toJalali, toJalaliLong } from "@/lib/dates";
import type { CalendarDay } from "@/lib/jajiga/pricing";
import { formatNumber, formatToman, formatTomanShort } from "@/lib/metrics";

/**
 * Interactive Jalali calendar grid (plan M3): clicking a future night lets the
 * host block/unblock it or record a real reservation. Host records always win
 * over radar inference.
 */

export interface HostNightInfo {
  /** Night is blocked by a host record in the local database. */
  hostBlocked: boolean;
  blockReason: string;
  /** Set when a manual reservation covers the night. */
  reservationId: number | null;
  reservationNote: string;
}

export type InteractiveDay = CalendarDay & { host: HostNightInfo };

const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const inputClass =
  "w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-brand-400/50";
const labelClass = "mb-1 block text-[11px] font-bold text-slate-400";

function parseAmount(value: string): number | null {
  const normalized = value
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[,،٬\s]/g, "")
    .replace(/تومان/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function CalendarGrid({ days, today }: { days: InteractiveDay[]; today: string }) {
  const [selected, setSelected] = useState<InteractiveDay | null>(null);
  const leadingBlanks = days.length ? days[0].weekday : 0;

  return (
    <div>
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
          <DayCell
            key={day.date}
            day={day}
            today={today}
            onSelect={() => setSelected(day)}
            isSelected={selected?.date === day.date}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-3 text-[10px] text-slate-500">
        <LegendDot className="bg-emerald-400/70" label="رزروشده" />
        <LegendDot className="bg-violet-400/70" label="رزرو ثبت دستی" />
        <LegendDot className="bg-slate-500/70" label="بسته توسط شما" />
        <LegendDot className="bg-white/15" label="قابل رزرو" />
        <LegendDot className="bg-amber-400/70" label="زیر نرخ بازار" />
        <LegendDot className="bg-rose-400/70" label="بالای نرخ بازار" />
      </div>

      {selected ? (
        <NightPanel day={selected} today={today} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function DayCell({
  day,
  today,
  onSelect,
  isSelected,
}: {
  day: InteractiveDay;
  today: string;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const base =
    "relative w-full rounded-lg p-1.5 text-center ring-1 transition min-h-[62px] flex flex-col justify-between";

  const isManual = day.host.reservationId !== null;

  const stateClass = isManual
    ? "bg-violet-400/14 ring-violet-400/30"
    : day.state === "booked"
      ? "bg-emerald-400/14 ring-emerald-400/30"
      : day.state === "blocked"
        ? "bg-slate-500/12 ring-white/8"
        : day.state === "open"
          ? "bg-white/4 ring-white/8 hover:bg-white/8"
          : "bg-transparent ring-white/5";

  const dimmed = day.isPast || (!day.isTracked && !isManual && !day.host.hostBlocked);
  const clickable = !day.isPast;

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
    <button
      type="button"
      onClick={clickable ? onSelect : undefined}
      disabled={!clickable}
      className={`${base} ${stateClass} ${isToday ? "ring-2 ring-brand-400/60" : ""} ${
        isSelected ? "ring-2 ring-brand-300" : ""
      } ${dimmed ? "opacity-45" : ""} ${clickable ? "cursor-pointer" : "cursor-default"}`}
      title={toJalaliLong(day.date) + (day.holiday ? ` — ${day.holiday}` : "")}
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

      {dimmed || day.market === null ? (
        <span className="text-[9px] text-slate-600">&nbsp;</span>
      ) : (
        <span className="num block text-[9px] text-slate-500">{formatTomanShort(day.market)}</span>
      )}
    </button>
  );
}

/* ------------------------------- night panel ------------------------------ */

function NightPanel({
  day,
  today,
  onClose,
}: {
  day: InteractiveDay;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"menu" | "reserve">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManual = day.host.reservationId !== null;

  async function blockNight() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: day.date, reason: "بسته‌شده از تقویم" }),
    });
    setBusy(false);
    if (!response.ok) return setError("ثبت ناموفق بود");
    onClose();
    router.refresh();
  }

  async function unblockNight() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/blocks?date=${day.date}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return setError("حذف ناموفق بود");
    onClose();
    router.refresh();
  }

  async function cancelReservation() {
    if (day.host.reservationId === null) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: day.host.reservationId, status: "cancelled" }),
    });
    setBusy(false);
    if (!response.ok) return setError("لغو ناموفق بود");
    onClose();
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-xl bg-white/4 p-4 ring-1 ring-brand-400/25">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-bold text-slate-100">
          {toJalaliLong(day.date)}
          {day.holiday ? <span className="mr-2 text-[11px] text-amber-300">{day.holiday}</span> : null}
        </p>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/8 hover:text-slate-200"
        >
          بستن پنجره
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span>
          وضعیت:{" "}
          <strong className="text-slate-200">
            {isManual
              ? "رزرو ثبت دستی"
              : day.host.hostBlocked
                ? "بسته توسط شما"
                : day.state === "booked"
                  ? "رزروشده (استنباط از تقویم جاجیگا)"
                  : day.state === "blocked"
                    ? "بسته (تقویم جاجیگا)"
                    : day.state === "open"
                      ? "قابل رزرو"
                      : "خارج از بازه رصد"}
          </strong>
        </span>
        {day.effectivePrice !== null ? (
          <span>
            نرخ شما: <strong className="num text-slate-200">{formatToman(day.effectivePrice)}</strong>
          </span>
        ) : null}
        {day.market !== null ? (
          <span>
            میانه بازار: <strong className="num text-slate-200">{formatToman(day.market)}</strong>
          </span>
        ) : null}
      </div>

      {mode === "menu" ? (
        <div className="flex flex-wrap gap-2">
          {isManual ? (
            <>
              {day.host.reservationNote ? (
                <p className="w-full text-[11px] text-slate-400">
                  یادداشت: {day.host.reservationNote}
                </p>
              ) : null}
              <button
                onClick={cancelReservation}
                disabled={busy}
                className="rounded-lg bg-rose-500/15 px-3 py-2 text-[12px] font-bold text-rose-300 ring-1 ring-rose-400/30 transition hover:bg-rose-500/25 disabled:opacity-50"
              >
                لغو این رزرو
              </button>
            </>
          ) : day.host.hostBlocked ? (
            <button
              onClick={unblockNight}
              disabled={busy}
              className="rounded-lg bg-white/8 px-3 py-2 text-[12px] font-bold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/12 disabled:opacity-50"
            >
              بازکردن این شب
            </button>
          ) : (
            <>
              <button
                onClick={() => setMode("reserve")}
                className="rounded-lg bg-brand-500/90 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-brand-500"
              >
                ثبت رزرو از این شب
              </button>
              <button
                onClick={blockNight}
                disabled={busy}
                className="rounded-lg bg-white/8 px-3 py-2 text-[12px] font-bold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/12 disabled:opacity-50"
              >
                بستن این شب
              </button>
            </>
          )}
        </div>
      ) : (
        <ReservationForm
          checkInDefault={day.date}
          suggestedNightly={day.effectivePrice ?? day.market ?? null}
          onDone={() => {
            onClose();
            router.refresh();
          }}
          onBack={() => setMode("menu")}
        />
      )}

      {error ? <p className="mt-2 text-[11px] font-bold text-rose-300">{error}</p> : null}
      {day.date < today ? null : null}
    </div>
  );
}

/* ----------------------------- reservation form ---------------------------- */

function ReservationForm({
  checkInDefault,
  suggestedNightly,
  onDone,
  onBack,
}: {
  checkInDefault: string;
  suggestedNightly: number | null;
  onDone: () => void;
  onBack: () => void;
}) {
  const [checkIn, setCheckIn] = useState(toJalali(checkInDefault));
  const [nights, setNights] = useState("1");
  const [guests, setGuests] = useState("2");
  const [amount, setAmount] = useState(suggestedNightly ? String(suggestedNightly) : "");
  const [discount, setDiscount] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const checkInIso = parseJalaliInput(checkIn);
    if (!checkInIso) return setError("تاریخ ورود معتبر نیست — مثال: ۱۴۰۵/۰۵/۲۶");
    const nightCount = Number(nights.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))));
    if (!Number.isInteger(nightCount) || nightCount < 1 || nightCount > 90) {
      return setError("تعداد شب باید بین ۱ تا ۹۰ باشد");
    }
    const guestCount = Number(guests.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))));
    const grossAmount = parseAmount(amount);
    if (grossAmount === null || grossAmount === 0) return setError("مبلغ کل معتبر نیست");
    const discountAmount = parseAmount(discount) ?? 0;

    // check_out = check_in + nights (exclusive)
    const checkOutDate = new Date(checkInIso + "T12:00:00");
    checkOutDate.setDate(checkOutDate.getDate() + nightCount);
    const checkOutIso = checkOutDate.toISOString().slice(0, 10);

    setBusy(true);
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn: checkInIso,
        checkOut: checkOutIso,
        guests: Number.isInteger(guestCount) && guestCount > 0 ? guestCount : null,
        grossAmount,
        discountAmount,
        source: "manual",
        status: "confirmed",
        note,
      }),
    });
    setBusy(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return setError(body?.error ?? "ثبت رزرو ناموفق بود");
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <div>
        <label className={labelClass}>تاریخ ورود (شمسی)</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>تعداد شب</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={nights}
          onChange={(e) => setNights(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <div>
        <label className={labelClass}>تعداد مهمان</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <div>
        <label className={labelClass}>مبلغ کل اقامت (تومان)</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <div>
        <label className={labelClass}>تخفیف (تومان)</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <div>
        <label className={labelClass}>یادداشت</label>
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثلاً مهمان تلفنی"
        />
      </div>
      <div className="col-span-2 flex gap-2 lg:col-span-3">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-brand-500/90 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "در حال ثبت…" : "ثبت رزرو"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-white/8 px-4 py-2 text-[12px] font-bold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/12"
        >
          بازگشت
        </button>
      </div>
      {error ? (
        <p className="col-span-2 text-[11px] font-bold text-rose-300 lg:col-span-3">{error}</p>
      ) : null}
    </form>
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
