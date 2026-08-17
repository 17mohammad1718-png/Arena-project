import type { CalendarDay } from "./jajiga/pricing";
import type { PriceChange } from "./market-trends";
import type { SupplyTrend } from "./supply";
import { formatNumber, formatPercent, formatToman } from "./metrics";
import { toJalaliLong } from "./dates";

/**
 * Phase 3 (N4): time-aware rule engine. Every rule is a pure function that
 * looks at a change or a gap and produces an actionable Persian alert with
 * its evidence and a link. The caller logs alerts through alert_log so the
 * same rule fires at most once per day and dismissals stick.
 */

export interface Alert {
  /** Stable rule id — the dedup key in alert_log. */
  ruleKey: string;
  severity: "warning" | "info";
  title: string;
  detail: string;
  action: string;
  href: string;
  payload: Record<string, unknown>;
}

/* --------------------------------- rules ---------------------------------- */

/** Open weekend nights in the next 14 days priced below the suggested floor. */
export function weekendUnderpricedRule(days: CalendarDay[], today: string): Alert | null {
  const horizon = days.filter(
    (day) =>
      !day.isPast &&
      day.date > today &&
      diffDaysISO(today, day.date) <= 14 &&
      day.isWeekend &&
      day.state === "open" &&
      day.effectivePrice !== null &&
      day.suggestedMin !== null &&
      day.effectivePrice < day.suggestedMin,
  );
  if (!horizon.length) return null;

  const uplift = horizon.reduce(
    (sum, day) => sum + ((day.suggestedMin ?? 0) - (day.effectivePrice ?? 0)),
    0,
  );
  const firstNight = horizon[0];

  return {
    ruleKey: "weekend-underpriced",
    severity: "warning",
    title: `${formatNumber(horizon.length)} شب آخر هفته پیش رو زیر کف بازه پیشنهادی است`,
    detail: `نزدیک‌ترین مورد ${toJalaliLong(firstNight.date)} است: نرخ شما ${formatToman(
      firstNight.effectivePrice ?? 0,
    )} در برابر کف پیشنهادی ${formatToman(firstNight.suggestedMin ?? 0)}. ظرفیت افزایش مجموع این شب‌ها ${formatToman(
      uplift,
    )} است.`,
    action: "نرخ این شب‌ها را در تقویم بازبینی کنید.",
    href: "/calendar",
    payload: { nights: horizon.map((day) => day.date), uplift },
  };
}

/** Owner's 30-night fill meaningfully behind the peer median. */
export function occupancyBehindRule(
  ownerOccupancy: number | null,
  peerMedianOccupancy: number | null,
  peerCount: number,
): Alert | null {
  if (ownerOccupancy === null || peerMedianOccupancy === null) return null;
  if (peerCount < 5 || peerMedianOccupancy <= 0.05) return null;
  const gap = peerMedianOccupancy - ownerOccupancy;
  if (gap < 0.15) return null;

  return {
    ruleKey: "occupancy-behind",
    severity: "warning",
    title: "تقویم شما از رقبای مشابه عقب‌تر پر می‌شود",
    detail: `از ۳۰ شب آینده، ${formatPercent(ownerOccupancy)} تقویم شما بسته/رزرو است در حالی که میانه ${formatNumber(
      peerCount,
    )} رقیب مشابه ${formatPercent(peerMedianOccupancy)} است (فاصله ${formatPercent(gap)}).`,
    action: "قیمت شب‌های نزدیک و کیفیت عکس‌های آگهی را بازبینی کنید.",
    href: "/market",
    payload: { ownerOccupancy, peerMedianOccupancy, gap },
  };
}

/** A tracked competitor moved its median asking price sharply. */
export function competitorPriceMoveRule(
  changes: PriceChange[],
  titles: Map<number, string>,
  threshold = 0.1,
): Alert | null {
  const big = changes.filter((change) => Math.abs(change.changePercent) >= threshold);
  if (!big.length) return null;
  const top = big[0];
  const direction = top.changePercent > 0 ? "افزایش" : "کاهش";

  return {
    ruleKey: "competitor-price-move",
    severity: "info",
    title: `${formatNumber(big.length)} رقیب قیمتش را از برش قبل به‌شدت تغییر داده`,
    detail: `بزرگ‌ترین تغییر: «${titles.get(top.roomId) ?? `اتاق ${top.roomId}`}» با ${direction} ${formatPercent(
      Math.abs(top.changePercent),
    )} (${formatToman(top.fromMedian)} ← ${formatToman(top.toMedian)}).`,
    action: "جایگاه قیمتی خود را نسبت به این تغییرها بسنجید.",
    href: `/competitors/${top.roomId}`,
    payload: { rooms: big.map((change) => change.roomId) },
  };
}

/** New listings entered the area during the supply snapshot window. */
export function newSupplyRule(trend: SupplyTrend, minNew = 3): Alert | null {
  if (!trend.first || !trend.last) return null;
  if (trend.newRoomIds.length < minNew) return null;

  return {
    ruleKey: "new-supply",
    severity: "info",
    title: `${formatNumber(trend.newRoomIds.length)} آگهی جدید در بابلکنار فهرست شده`,
    detail: `بین ${toJalaliLong(trend.first.date)} و ${toJalaliLong(trend.last.date)}، ${formatNumber(
      trend.newRoomIds.length,
    )} اتاق جدید به فهرست منطقه اضافه و ${formatNumber(
      trend.goneRoomIds.length,
    )} مورد خارج شده است. عرضه بیشتر یعنی رقابت شدیدتر بر سر همان تقاضا.`,
    action: "روند عرضه را در صفحه مقایسه بازار دنبال کنید.",
    href: "/market",
    payload: { newRooms: trend.newRoomIds.length, gone: trend.goneRoomIds.length },
  };
}

/** Market calendars filling faster since the previous capture. */
export function marketHeatRule(
  occupancyTrend: { capturedAt: string; avgOccupancy: number }[],
): Alert | null {
  if (occupancyTrend.length < 2) return null;
  const prev = occupancyTrend[occupancyTrend.length - 2];
  const last = occupancyTrend[occupancyTrend.length - 1];
  const delta = last.avgOccupancy - prev.avgOccupancy;
  if (delta < 0.08) return null;

  return {
    ruleKey: "market-heating",
    severity: "info",
    title: "تقویم منطقه از برش قبل به‌سرعت پرتر شده",
    detail: `میانگین پر بودن تقویم رقبا از ${formatPercent(prev.avgOccupancy)} به ${formatPercent(
      last.avgOccupancy,
    )} رسیده (+${formatPercent(delta)}). تقاضا در حال بالارفتن است.`,
    action: "شب‌های باز نزدیک را با نرخ بالاتر آزمایش کنید.",
    href: "/calendar",
    payload: { prev: prev.avgOccupancy, last: last.avgOccupancy },
  };
}

/* -------------------------------- assembly -------------------------------- */

export interface AlertInputs {
  today: string;
  calendarDays: CalendarDay[];
  ownerOccupancy: number | null;
  peerMedianOccupancy: number | null;
  peerCount: number;
  priceChanges: PriceChange[];
  competitorTitles: Map<number, string>;
  supplyTrend: SupplyTrend;
  occupancyTrend: { capturedAt: string; avgOccupancy: number }[];
}

/** Run every rule; order = severity first, then rule order. */
export function buildAlerts(inputs: AlertInputs): Alert[] {
  const alerts = [
    weekendUnderpricedRule(inputs.calendarDays, inputs.today),
    occupancyBehindRule(
      inputs.ownerOccupancy,
      inputs.peerMedianOccupancy,
      inputs.peerCount,
    ),
    competitorPriceMoveRule(inputs.priceChanges, inputs.competitorTitles),
    newSupplyRule(inputs.supplyTrend),
    marketHeatRule(inputs.occupancyTrend),
  ].filter((alert): alert is Alert => alert !== null);

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));
}

function diffDaysISO(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
