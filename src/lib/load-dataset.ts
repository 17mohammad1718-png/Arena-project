import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { normalizeDigits, parseCsv, toBoolean, toList, toNumber } from "./csv";
import { addDays, diffDays, parseJalaliInput } from "./dates";
import { buildDemoDataset } from "./demo-data";
import {
  blockedNightSchema,
  competitorSchema,
  dailyPriceSchema,
  dailyViewsSchema,
  expenseSchema,
  propertySchema,
  reservationSchema,
} from "./types";
import type {
  BlockedNight,
  Competitor,
  DailyPrice,
  DailyViews,
  Dataset,
  EntityKey,
  EntitySourceReport,
  Expense,
  Property,
  Reservation,
} from "./types";

/**
 * Real-dataset loader.
 *
 * Drop files into `data/` and they replace the demo data automatically. Each
 * entity is loaded independently, so a partial dataset (for example only
 * reservations) still works — the rest stays on demo values and the UI reports
 * exactly which parts are real.
 *
 * Accepted file names per entity are listed in `FILE_CANDIDATES`; both `.csv`
 * and `.json` are supported, as are Persian file names.
 */

export const DATA_DIR = path.join(process.cwd(), "data");

const FILE_CANDIDATES: Record<EntityKey, string[]> = {
  property: ["property", "listing", "aghamatgah", "eghamatgah", "اقامتگاه", "ملک"],
  reservations: ["reservations", "bookings", "reserve", "رزروها", "رزرو"],
  blockedNights: ["blocked", "blocked-nights", "blocked_nights", "مسدود", "شب‌های‌مسدود"],
  expenses: ["expenses", "costs", "هزینه", "هزینه‌ها"],
  dailyPrices: ["prices", "daily-prices", "daily_prices", "calendar", "قیمت", "قیمت‌ها"],
  views: ["views", "traffic", "بازدید", "بازدیدها"],
  competitors: ["competitors", "market", "rivals", "رقبا", "رقیب"],
};

const ENTITY_LABELS: Record<EntityKey, string> = {
  property: "مشخصات اقامتگاه",
  reservations: "رزروها",
  blockedNights: "شب‌های مسدود",
  expenses: "هزینه‌ها",
  dailyPrices: "قیمت روزانه",
  views: "بازدیدها",
  competitors: "رقبا",
};

/* -------------------------------------------------------------------------- */
/*                              Column resolution                             */
/* -------------------------------------------------------------------------- */

/** Normalise a header for fuzzy matching: lowercase, no spaces/underscores. */
function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
}

/** Find the first value in `row` whose header matches any alias. */
function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeKey(key), value);
  }
  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/**
 * Accept ISO (`2026-03-21`), Jalali (`1404/12/29`, `1404-12-29`) and Persian
 * digits. Jalali years are detected by a value below 1700.
 */
export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getFullYear();
    return `${y}-${`${value.getMonth() + 1}`.padStart(2, "0")}-${`${value.getDate()}`.padStart(2, "0")}`;
  }
  if (typeof value !== "string") return null;

  const raw = normalizeDigits(value).trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return null;

  const [, yStr, mStr, dStr] = match;
  const year = Number(yStr);
  const month = `${Number(mStr)}`.padStart(2, "0");
  const day = `${Number(dStr)}`.padStart(2, "0");

  if (year < 1700) {
    // Jalali — including 2-digit shorthand such as 04/01/15.
    const fullYear = year < 100 ? 1400 + year : year;
    return parseJalaliInput(`${fullYear}/${month}/${day}`);
  }
  return `${year}-${month}-${day}`;
}

/* -------------------------------------------------------------------------- */
/*                                File discovery                              */
/* -------------------------------------------------------------------------- */

interface RawFile {
  file: string;
  rows: Record<string, unknown>[];
  single: Record<string, unknown> | null;
}

/** Directories inside `data/` that hold examples rather than real records. */
const IGNORED_DIRS = new Set(["templates", "template", "sample", "samples", "example", "examples"]);

function listDataFiles(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  const walk = (dir: string, depth = 0): string[] => {
    if (depth > 2) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name.toLowerCase())) return [];
        return walk(full, depth + 1);
      }
      if (/\.(csv|json|tsv)$/i.test(entry.name)) return [full];
      return [];
    });
  };
  return walk(DATA_DIR);
}

function findFile(key: EntityKey, files: string[]): string | null {
  const candidates = FILE_CANDIDATES[key];
  const scored = files
    .map((file) => {
      const base = normalizeKey(path.basename(file).replace(/\.(csv|json|tsv)$/i, ""));
      const index = candidates.findIndex((c) => base === normalizeKey(c));
      const partial = candidates.findIndex((c) => base.includes(normalizeKey(c)));
      // Files sitting directly in `data/` win over files nested in subfolders.
      const depth = path.relative(DATA_DIR, file).split(path.sep).length - 1;
      const depthPenalty = depth * 5;
      if (index >= 0) return { file, score: 100 - index - depthPenalty };
      if (partial >= 0) return { file, score: 50 - partial - depthPenalty };
      return null;
    })
    .filter((v): v is { file: string; score: number } => v !== null)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.file ?? null;
}

function readRaw(file: string): RawFile {
  const content = readFileSync(file, "utf8");
  if (/\.json$/i.test(file)) {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return { file, rows: parsed, single: null };
    // Allow `{ "reservations": [...] }` or a bare object for the property.
    const arrayValue = Object.values(parsed).find((v) => Array.isArray(v));
    if (arrayValue && Object.keys(parsed).length === 1) {
      return { file, rows: arrayValue as Record<string, unknown>[], single: null };
    }
    return { file, rows: [parsed], single: parsed };
  }
  const rows = parseCsv(content);
  return { file, rows, single: rows[0] ?? null };
}

/* -------------------------------------------------------------------------- */
/*                                   Mappers                                  */
/* -------------------------------------------------------------------------- */

type Mapped<T> = { records: T[]; issues: string[] };

function mapRows<T>(
  rows: Record<string, unknown>[],
  mapper: (row: Record<string, unknown>, index: number) => T | null,
  validate: (value: T) => { success: boolean; error?: string },
): Mapped<T> {
  const records: T[] = [];
  const issues: string[] = [];

  rows.forEach((row, index) => {
    try {
      const mapped = mapper(row, index);
      if (!mapped) {
        issues.push(`ردیف ${index + 1}: داده‌های ضروری ناقص است`);
        return;
      }
      const result = validate(mapped);
      if (!result.success) {
        issues.push(`ردیف ${index + 1}: ${result.error}`);
        return;
      }
      records.push(mapped);
    } catch (error) {
      issues.push(`ردیف ${index + 1}: ${(error as Error).message}`);
    }
  });

  return { records, issues: issues.slice(0, 12) };
}

function zodValidator<T>(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }) {
  return (value: T) => {
    const result = schema.safeParse(value);
    if (result.success) return { success: true };
    const issues = (result.error as { issues?: { path: (string | number)[]; message: string }[] })
      ?.issues;
    const first = issues?.[0];
    return {
      success: false,
      error: first ? `${first.path.join(".") || "مقدار"} — ${first.message}` : "نامعتبر",
    };
  };
}

function mapProperty(row: Record<string, unknown>): Property | null {
  const title = pick(row, ["title", "name", "عنوان", "نام", "نام اقامتگاه"]);
  if (!title) return null;

  const capacity = toNumber(pick(row, ["capacity", "guests", "ظرفیت", "ظرفیت استاندارد"])) ?? 4;
  const basePrice =
    toNumber(pick(row, ["basePrice", "price", "weekdayPrice", "قیمت", "قیمت پایه", "قیمت روز عادی"])) ??
    0;

  return {
    id: String(pick(row, ["id", "listingCode", "code", "شناسه", "کد"]) ?? "host-property"),
    title: String(title),
    listingCode: optionalString(pick(row, ["listingCode", "code", "کد آگهی", "کد"])),
    url: optionalString(pick(row, ["url", "link", "لینک", "آدرس"])),
    area: String(pick(row, ["area", "neighborhood", "منطقه", "محله"]) ?? "—"),
    city: String(pick(row, ["city", "شهر"]) ?? "—"),
    province: String(pick(row, ["province", "استان"]) ?? "—"),
    propertyType: String(pick(row, ["propertyType", "type", "نوع", "نوع اقامتگاه"]) ?? "اقامتگاه"),
    capacity,
    extraCapacity: toNumber(pick(row, ["extraCapacity", "ظرفیت اضافه", "نفرات اضافه"])) ?? 0,
    bedrooms: toNumber(pick(row, ["bedrooms", "rooms", "اتاق", "تعداد اتاق"])) ?? 1,
    builtAreaM2: toNumber(pick(row, ["builtAreaM2", "buildingArea", "متراژ بنا", "زیربنا"])) ?? undefined,
    landAreaM2: toNumber(pick(row, ["landAreaM2", "landArea", "متراژ محوطه", "مساحت زمین"])) ?? undefined,
    amenities: toList(pick(row, ["amenities", "facilities", "امکانات"])),
    basePrice,
    weekendPrice:
      toNumber(pick(row, ["weekendPrice", "قیمت آخر هفته", "قیمت تعطیلات"])) ?? undefined,
    extraGuestFee:
      toNumber(pick(row, ["extraGuestFee", "هزینه نفر اضافه", "نفر اضافه"])) ?? undefined,
    rating: toNumber(pick(row, ["rating", "score", "امتیاز"])) ?? undefined,
    reviewsCount: toNumber(pick(row, ["reviewsCount", "reviews", "تعداد نظرات", "نظرات"])) ?? undefined,
  };
}

function mapReservation(row: Record<string, unknown>, index: number): Reservation | null {
  const checkIn = toIsoDate(pick(row, ["checkIn", "checkin", "startDate", "from", "تاریخ ورود", "ورود"]));
  let checkOut = toIsoDate(
    pick(row, ["checkOut", "checkout", "endDate", "to", "تاریخ خروج", "خروج"]),
  );
  if (!checkIn) return null;

  // Some exports give a night count instead of a checkout date.
  if (!checkOut) {
    const nights = toNumber(pick(row, ["nights", "تعداد شب", "شب"]));
    if (nights && nights > 0) checkOut = addDays(checkIn, nights);
  }
  if (!checkOut) return null;

  const gross =
    toNumber(pick(row, ["grossAmount", "amount", "total", "revenue", "مبلغ", "مبلغ کل", "درآمد"])) ?? 0;

  const rawStatus = String(pick(row, ["status", "وضعیت"]) ?? "").trim();
  const status = normalizeStatus(rawStatus, checkIn);

  return {
    id: String(pick(row, ["id", "code", "شناسه", "کد رزرو"]) ?? `res-${index + 1}`),
    checkIn,
    checkOut,
    guests: toNumber(pick(row, ["guests", "nafar", "تعداد نفرات", "مهمان"])) ?? 2,
    status,
    grossAmount: gross,
    platformFee: toNumber(pick(row, ["platformFee", "fee", "commission", "کمیسیون", "کارمزد"])) ?? 0,
    discount: toNumber(pick(row, ["discount", "تخفیف"])) ?? 0,
    refund: toNumber(pick(row, ["refund", "بازپرداخت", "استرداد"])) ?? 0,
    note: optionalString(pick(row, ["note", "توضیحات", "یادداشت"])),
  };
}

function normalizeStatus(raw: string, checkIn: string): Reservation["status"] {
  const value = raw.toLowerCase();
  if (["cancelled", "canceled", "cancel", "لغو", "لغو شده", "کنسل"].some((v) => value.includes(v))) {
    return "cancelled";
  }
  if (["upcoming", "future", "pending", "آینده", "پیش رو", "در انتظار"].some((v) => value.includes(v))) {
    return "upcoming";
  }
  if (["completed", "done", "past", "انجام شده", "تکمیل", "گذشته"].some((v) => value.includes(v))) {
    return "completed";
  }
  return checkIn > todayIso() ? "upcoming" : "completed";
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
}

function mapBlockedNight(row: Record<string, unknown>): BlockedNight | null {
  const date = toIsoDate(pick(row, ["date", "night", "تاریخ", "شب"]));
  if (!date) return null;
  const rawReason = String(pick(row, ["reason", "دلیل", "علت"]) ?? "owner").toLowerCase();
  const reason: BlockedNight["reason"] = rawReason.includes("تعمیر") || rawReason.includes("maintenance")
    ? "maintenance"
    : rawReason.includes("شخص") || rawReason.includes("personal")
      ? "personal"
      : rawReason.includes("other") || rawReason.includes("سایر")
        ? "other"
        : "owner";
  return { date, reason, note: optionalString(pick(row, ["note", "توضیحات"])) };
}

function mapExpense(row: Record<string, unknown>, index: number): Expense | null {
  const date = toIsoDate(pick(row, ["date", "تاریخ"]));
  const amount = toNumber(pick(row, ["amount", "cost", "مبلغ", "هزینه"]));
  if (!date || amount === null) return null;
  return {
    id: String(pick(row, ["id", "شناسه"]) ?? `exp-${index + 1}`),
    date,
    category: String(pick(row, ["category", "type", "دسته", "نوع", "شرح"]) ?? "سایر"),
    amount,
    note: optionalString(pick(row, ["note", "توضیحات"])),
  };
}

function mapDailyPrice(row: Record<string, unknown>): DailyPrice | null {
  const date = toIsoDate(pick(row, ["date", "تاریخ", "روز"]));
  const price = toNumber(pick(row, ["price", "nightlyPrice", "قیمت", "نرخ", "قیمت شبانه"]));
  if (!date || price === null) return null;
  return {
    date,
    price,
    available: toBoolean(pick(row, ["available", "isAvailable", "آزاد", "موجود", "وضعیت"])),
  };
}

function mapViews(row: Record<string, unknown>): DailyViews | null {
  const date = toIsoDate(pick(row, ["date", "تاریخ"]));
  const views = toNumber(pick(row, ["views", "visits", "بازدید", "تعداد بازدید"]));
  if (!date || views === null) return null;
  return {
    date,
    views: Math.round(views),
    inquiries: Math.round(toNumber(pick(row, ["inquiries", "requests", "درخواست", "پیام"])) ?? 0),
  };
}

function mapCompetitor(row: Record<string, unknown>, index: number): Competitor | null {
  const title = pick(row, ["title", "name", "عنوان", "نام"]);
  const weekdayPrice = toNumber(
    pick(row, ["weekdayPrice", "price", "basePrice", "قیمت", "قیمت روز عادی", "قیمت پایه"]),
  );
  if (!title || weekdayPrice === null) return null;

  return {
    id: String(pick(row, ["id", "code", "شناسه", "کد"]) ?? `comp-${index + 1}`),
    title: String(title),
    url: optionalString(pick(row, ["url", "link", "لینک"])),
    area: String(pick(row, ["area", "location", "منطقه", "محله"]) ?? "—"),
    distanceKm: toNumber(pick(row, ["distanceKm", "distance", "فاصله"])) ?? undefined,
    propertyType: String(pick(row, ["propertyType", "type", "نوع"]) ?? "اقامتگاه"),
    capacity: toNumber(pick(row, ["capacity", "guests", "ظرفیت"])) ?? 4,
    bedrooms: toNumber(pick(row, ["bedrooms", "rooms", "اتاق"])) ?? 1,
    builtAreaM2: toNumber(pick(row, ["builtAreaM2", "area_m2", "متراژ", "زیربنا"])) ?? undefined,
    weekdayPrice,
    weekendPrice: toNumber(pick(row, ["weekendPrice", "قیمت آخر هفته"])) ?? undefined,
    rating: toNumber(pick(row, ["rating", "score", "امتیاز"])) ?? undefined,
    reviewsCount: toNumber(pick(row, ["reviewsCount", "reviews", "تعداد نظرات"])) ?? undefined,
    amenities: toList(pick(row, ["amenities", "facilities", "امکانات"])),
    unavailableShare: normalizeShare(
      toNumber(pick(row, ["unavailableShare", "occupancy", "پر بودن", "درصد پر بودن"])),
    ),
  };
}

function normalizeShare(value: number | null): number | undefined {
  if (value === null) return undefined;
  if (value > 1 && value <= 100) return value / 100;
  if (value >= 0 && value <= 1) return value;
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str === "" ? undefined : str;
}

/* -------------------------------------------------------------------------- */
/*                                 Public API                                 */
/* -------------------------------------------------------------------------- */

export function loadDataset(): Dataset {
  const demo = buildDemoDataset();
  const files = listDataFiles();
  const reports: EntitySourceReport[] = [];

  const load = <T>(
    key: EntityKey,
    mapper: (row: Record<string, unknown>, index: number) => T | null,
    schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
    fallback: T[],
  ): T[] => {
    const file = findFile(key, files);
    if (!file) {
      reports.push({
        key,
        label: ENTITY_LABELS[key],
        origin: "demo",
        recordCount: fallback.length,
        issues: [],
      });
      return fallback;
    }

    try {
      const raw = readRaw(file);
      const { records, issues } = mapRows(raw.rows, mapper, zodValidator(schema));
      const relative = path.relative(process.cwd(), file);

      if (!records.length) {
        reports.push({
          key,
          label: ENTITY_LABELS[key],
          origin: "demo",
          file: relative,
          recordCount: fallback.length,
          issues: issues.length ? issues : ["هیچ ردیف معتبری خوانده نشد"],
        });
        return fallback;
      }

      reports.push({
        key,
        label: ENTITY_LABELS[key],
        origin: "real",
        file: relative,
        recordCount: records.length,
        issues,
      });
      return records;
    } catch (error) {
      reports.push({
        key,
        label: ENTITY_LABELS[key],
        origin: "demo",
        file: path.relative(process.cwd(), file),
        recordCount: fallback.length,
        issues: [`خطا در خواندن فایل: ${(error as Error).message}`],
      });
      return fallback;
    }
  };

  const propertyList = load<Property>("property", mapProperty, propertySchema, [demo.property]);
  const property = propertyList[0] ?? demo.property;

  const reservations = load<Reservation>(
    "reservations",
    mapReservation,
    reservationSchema,
    demo.reservations,
  );
  const blockedNights = load<BlockedNight>(
    "blockedNights",
    mapBlockedNight,
    blockedNightSchema,
    demo.blockedNights,
  );
  const expenses = load<Expense>("expenses", mapExpense, expenseSchema, demo.expenses);
  const dailyPrices = load<DailyPrice>(
    "dailyPrices",
    mapDailyPrice,
    dailyPriceSchema,
    demo.dailyPrices,
  );
  const views = load<DailyViews>("views", mapViews, dailyViewsSchema, demo.views);
  const competitors = load<Competitor>(
    "competitors",
    mapCompetitor,
    competitorSchema,
    demo.competitors,
  );

  const realCount = reports.filter((r) => r.origin === "real").length;
  const origin: Dataset["origin"] =
    realCount === 0 ? "demo" : realCount === reports.length ? "real" : "mixed";

  return {
    property,
    reservations: [...reservations].sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    blockedNights,
    expenses,
    dailyPrices,
    views,
    competitors,
    origin,
    reports,
    range: computeRange({ reservations, blockedNights, expenses, dailyPrices, views }, demo.range),
  };
}

function computeRange(
  data: {
    reservations: Reservation[];
    blockedNights: BlockedNight[];
    expenses: Expense[];
    dailyPrices: DailyPrice[];
    views: DailyViews[];
  },
  fallback: { start: string; end: string },
): { start: string; end: string } {
  const dates: string[] = [
    ...data.reservations.flatMap((r) => [r.checkIn, r.checkOut]),
    ...data.blockedNights.map((b) => b.date),
    ...data.expenses.map((e) => e.date),
    ...data.dailyPrices.map((p) => p.date),
    ...data.views.map((v) => v.date),
  ].filter(Boolean);

  if (!dates.length) return fallback;

  const sorted = [...dates].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  // Guard against a single-day dataset producing an empty ledger.
  return diffDays(start, end) < 1 ? { start, end: addDays(start, 30) } : { start, end };
}
