import { addDays, parseJalaliInput } from "./dates";
import type { BlockInput, ExpenseInput, ReservationInput } from "./db/schemas";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from "./db/schemas";

/**
 * CSV import (plan M4): pure parsing + normalization so the whole pipeline is
 * unit-testable. Handles Persian digits, Jalali or Gregorian dates, thousands
 * separators, «تومان», Persian column headers and quoted CSV fields.
 * Excel users: save as CSV (UTF-8) — documented on the import page.
 */

export type ImportKind = "reservations" | "expenses" | "blocks";

export interface RowIssue {
  line: number;
  message: string;
  raw: string;
}

export interface ImportResult<T> {
  valid: T[];
  invalid: RowIssue[];
  columns: string[];
}

/* ------------------------------ normalization ----------------------------- */

export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
}

/** Accepts ISO Gregorian or Jalali (1405/05/26, 1405-05-26) dates. */
export function normalizeDate(value: string): string | null {
  const raw = normalizeDigits(value.trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    // Jalali years are ~1300-1500; Gregorian ~1900-2200.
    if (year >= 1200 && year <= 1600) return parseJalaliInput(raw.replace(/-/g, "/"));
    return raw;
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(raw)) {
    const year = Number(raw.split("/")[0]);
    if (year >= 1200 && year <= 1600) return parseJalaliInput(raw);
    const [y, m, d] = raw.split("/").map(Number);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

export function normalizeAmount(value: string): number | null {
  const raw = normalizeDigits(value)
    .replace(/[,،٬\s]/g, "")
    .replace(/تومان|ریال/g, "")
    .trim();
  if (!/^\d+$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) ? amount : null;
}

const CATEGORY_BY_LABEL = new Map<string, (typeof EXPENSE_CATEGORIES)[number]>([
  ...EXPENSE_CATEGORIES.map(
    (key) => [EXPENSE_CATEGORY_LABEL[key], key] as [string, (typeof EXPENSE_CATEGORIES)[number]],
  ),
  ...EXPENSE_CATEGORIES.map((key) => [key, key] as [string, (typeof EXPENSE_CATEGORIES)[number]]),
]);

export function normalizeCategory(value: string): (typeof EXPENSE_CATEGORIES)[number] {
  return CATEGORY_BY_LABEL.get(value.trim()) ?? "misc";
}

/* --------------------------------- CSV core -------------------------------- */

/** Minimal CSV parser: quoted fields, comma/semicolon/tab autodetect. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n", 1)[0] ?? "";
  const delimiter = [";", "\t", ","].find(
    (d) => firstLine.includes(d) && d !== ",",
  ) ?? ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

/* ------------------------------ column mapping ----------------------------- */

const COLUMN_ALIASES: Record<string, string[]> = {
  checkIn: ["checkin", "check_in", "تاریخ ورود", "ورود", "از", "check in"],
  checkOut: ["checkout", "check_out", "تاریخ خروج", "خروج", "تا", "check out"],
  nights: ["nights", "شب", "تعداد شب", "مدت اقامت"],
  guests: ["guests", "مهمان", "تعداد مهمان", "نفر"],
  grossAmount: ["grossamount", "gross_amount", "amount", "مبلغ", "مبلغ کل", "قیمت", "درآمد"],
  discountAmount: ["discountamount", "discount_amount", "discount", "تخفیف"],
  note: ["note", "یادداشت", "توضیح", "توضیحات", "شرح"],
  date: ["date", "تاریخ"],
  amount2: [],
  category: ["category", "دسته", "نوع", "نوع هزینه"],
  reason: ["reason", "دلیل", "علت"],
};

function matchColumn(header: string): string | null {
  const norm = header.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(norm)) return key === "amount2" ? null : key;
  }
  return null;
}

function mapHeaders(headerRow: string[]): Map<number, string> {
  const map = new Map<number, string>();
  headerRow.forEach((header, index) => {
    const key = matchColumn(header);
    if (key && ![...map.values()].includes(key)) map.set(index, key);
  });
  return map;
}

function rowToRecord(row: string[], headers: Map<number, string>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [index, key] of headers) record[key] = (row[index] ?? "").trim();
  return record;
}

/* ------------------------------- importers -------------------------------- */

export function importReservations(text: string): ImportResult<ReservationInput> {
  const rows = parseCsv(text);
  if (!rows.length) return { valid: [], invalid: [], columns: [] };
  const headers = mapHeaders(rows[0]);
  const valid: ReservationInput[] = [];
  const invalid: RowIssue[] = [];

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const raw = cells.join("، ");
    const record = rowToRecord(cells, headers);

    const checkIn = record.checkIn ? normalizeDate(record.checkIn) : null;
    if (!checkIn) return invalid.push({ line, raw, message: "تاریخ ورود نامعتبر یا خالی" });

    let checkOut = record.checkOut ? normalizeDate(record.checkOut) : null;
    if (!checkOut && record.nights) {
      const nights = Number(normalizeDigits(record.nights));
      if (Number.isInteger(nights) && nights >= 1 && nights <= 90) {
        checkOut = addDays(checkIn, nights);
      }
    }
    if (!checkOut) return invalid.push({ line, raw, message: "تاریخ خروج یا تعداد شب لازم است" });
    if (checkOut <= checkIn)
      return invalid.push({ line, raw, message: "خروج باید بعد از ورود باشد" });

    const grossAmount = record.grossAmount ? normalizeAmount(record.grossAmount) : null;
    if (grossAmount === null) return invalid.push({ line, raw, message: "مبلغ نامعتبر یا خالی" });

    const discountAmount = record.discountAmount
      ? (normalizeAmount(record.discountAmount) ?? 0)
      : 0;
    if (discountAmount > grossAmount)
      return invalid.push({ line, raw, message: "تخفیف بزرگ‌تر از مبلغ کل است" });

    const guestsRaw = record.guests ? Number(normalizeDigits(record.guests)) : NaN;
    const guests = Number.isInteger(guestsRaw) && guestsRaw >= 1 && guestsRaw <= 50 ? guestsRaw : null;

    valid.push({
      checkIn,
      checkOut,
      guests,
      grossAmount,
      discountAmount,
      source: "import",
      status: "confirmed",
      note: record.note ?? "",
    });
  });

  return { valid, invalid, columns: [...headers.values()] };
}

export function importExpenses(text: string): ImportResult<ExpenseInput> {
  const rows = parseCsv(text);
  if (!rows.length) return { valid: [], invalid: [], columns: [] };
  const headers = mapHeaders(rows[0]);
  const valid: ExpenseInput[] = [];
  const invalid: RowIssue[] = [];

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const raw = cells.join("، ");
    const record = rowToRecord(cells, headers);

    const date = record.date ? normalizeDate(record.date) : null;
    if (!date) return invalid.push({ line, raw, message: "تاریخ نامعتبر یا خالی" });

    const amount = record.grossAmount ? normalizeAmount(record.grossAmount) : null;
    if (amount === null || amount <= 0)
      return invalid.push({ line, raw, message: "مبلغ نامعتبر یا خالی" });

    valid.push({
      date,
      amount,
      category: normalizeCategory(record.category ?? ""),
      note: record.note ?? "",
    });
  });

  return { valid, invalid, columns: [...headers.values()] };
}

export function importBlocks(text: string): ImportResult<BlockInput> {
  const rows = parseCsv(text);
  if (!rows.length) return { valid: [], invalid: [], columns: [] };
  const headers = mapHeaders(rows[0]);
  const valid: BlockInput[] = [];
  const invalid: RowIssue[] = [];

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const raw = cells.join("، ");
    const record = rowToRecord(cells, headers);

    const date = record.date ? normalizeDate(record.date) : null;
    if (!date) return invalid.push({ line, raw, message: "تاریخ نامعتبر یا خالی" });
    valid.push({ date, reason: record.reason ?? "" });
  });

  return { valid, invalid, columns: [...headers.values()] };
}
