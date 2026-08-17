import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Phase 3 (N5): data freshness per file group. The age source is the
 * dataset's own content (fetched_at / snapshot dates) where available, so a
 * git checkout with fresh mtimes cannot fake freshness; file mtime is the
 * fallback.
 */

export interface FreshnessGroup {
  key: string;
  title: string;
  /** ISO day of the newest observation in the group, or null when unknown. */
  newestDay: string | null;
  ageDays: number | null;
  /** Warn when age exceeds this many days. */
  staleAfterDays: number;
  status: "fresh" | "aging" | "stale" | "unknown";
  detail: string;
}

function ageInDays(newestDay: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(newestDay)) / 86_400_000));
}

function statusOf(ageDays: number | null, staleAfter: number): FreshnessGroup["status"] {
  if (ageDays === null) return "unknown";
  if (ageDays <= Math.ceil(staleAfter / 2)) return "fresh";
  if (ageDays <= staleAfter) return "aging";
  return "stale";
}

function fileMtimeDay(fullPath: string): string | null {
  try {
    return statSync(fullPath).mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function computeFreshness(dataDir: string, today: string): FreshnessGroup[] {
  const groups: FreshnessGroup[] = [];

  /* ------------------------------ radar group ------------------------------ */
  {
    const dir = path.join(dataDir, "radar");
    let newest: string | null = null;
    let count = 0;
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!/^\d+\.json$/.test(file)) continue;
        count += 1;
        try {
          const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
            fetched_at?: string;
          };
          const day = (raw.fetched_at ?? "").slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (!newest || day > newest)) newest = day;
        } catch {
          // unreadable file: ignore here, load issues are reported elsewhere
        }
      }
    }
    const age = newest ? ageInDays(newest, today) : null;
    groups.push({
      key: "radar",
      title: "تقویم رادار (قیمت و اشغال هر شب)",
      newestDay: newest,
      ageDays: age,
      staleAfterDays: 7,
      status: statusOf(age, 7),
      detail: `${count} اتاق رصدشده — منبع تقویم قیمت، شاخص بازار و هشدارها`,
    });
  }

  /* ----------------------------- supply snapshots --------------------------- */
  {
    const dir = path.join(dataDir, "snapshots");
    let newest: string | null = null;
    let count = 0;
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        const match = /^supply-(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
        if (!match) continue;
        count += 1;
        if (!newest || match[1] > newest) newest = match[1];
      }
    }
    const age = newest ? ageInDays(newest, today) : null;
    groups.push({
      key: "supply",
      title: "اسنپ‌شات عرضه منطقه",
      newestDay: newest,
      ageDays: age,
      staleAfterDays: 7,
      status: statusOf(age, 7),
      detail: `${count} اسنپ‌شات روزانه — منبع روند عرضه بابلکنار`,
    });
  }

  /* ------------------------------ pricing group ----------------------------- */
  {
    const file = path.join(dataDir, "pricing-dataset.json");
    const newest = existsSync(file) ? fileMtimeDay(file) : null;
    const age = newest ? ageInDays(newest, today) : null;
    groups.push({
      key: "pricing",
      title: "مشخصات و نرخ پایه اقامتگاه‌ها",
      newestDay: newest,
      ageDays: age,
      staleAfterDays: 14,
      status: statusOf(age, 14),
      detail: "منبع پروفایل رقبا، امکانات و جایگاه بازار (سن از mtime فایل)",
    });
  }

  /* ------------------------------ reviews group ----------------------------- */
  {
    const dir = path.join(dataDir, "reviews");
    let newest: string | null = null;
    let count = 0;
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith("_reviews.json")) continue;
        count += 1;
        const day = fileMtimeDay(path.join(dir, file));
        if (day && (!newest || day > newest)) newest = day;
      }
    }
    const age = newest ? ageInDays(newest, today) : null;
    groups.push({
      key: "reviews",
      title: "نظرات مهمانان",
      newestDay: newest,
      ageDays: age,
      staleAfterDays: 30,
      status: statusOf(age, 30),
      detail: `${count} فایل نظر — منبع صفحه نظرات (سن از mtime فایل)`,
    });
  }

  /* ------------------------------ revenue group ----------------------------- */
  {
    const dir = path.join(dataDir, "revenue");
    // Prefer capture days embedded in file names (past-revenue-YYYY-MM-DD);
    // only fall back to mtime when no file carries a date, so a fresh git
    // checkout cannot fake freshness.
    let newestNamed: string | null = null;
    let newestMtime: string | null = null;
    let count = 0;
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        count += 1;
        const match = /(\d{4}-\d{2}-\d{2})/.exec(file);
        if (match) {
          if (!newestNamed || match[1] > newestNamed) newestNamed = match[1];
        } else {
          const day = fileMtimeDay(path.join(dir, file));
          if (day && (!newestMtime || day > newestMtime)) newestMtime = day;
        }
      }
    }
    const newest = newestNamed ?? newestMtime;
    const age = newest ? ageInDays(newest, today) : null;
    groups.push({
      key: "revenue",
      title: "درآمد منطقه",
      newestDay: newest,
      ageDays: age,
      staleAfterDays: 10,
      status: statusOf(age, 10),
      detail: `${count} فایل — منبع رتبه‌بندی درآمد و درآمد محقق‌شده`,
    });
  }

  return groups;
}
