/**
 * `npm run import:bookings` — load the chalet-dashboard export
 * (data/chalet-bookings-latest.json) into the bookings_history table.
 *
 * Idempotent: uses INSERT OR REPLACE keyed on the booking id, so re-running
 * after a fresh export simply updates changed rows.
 *
 * Usage:
 *   npm run import:bookings
 *   npm run import:bookings -- --dry-run   show what would change
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getDb } from "../src/lib/db";
import { parseJalaliInput } from "../src/lib/dates";

const DATA_FILE = path.join(process.cwd(), "data", "chalet-bookings-latest.json");

interface ChaletBooking {
  id: number;
  name: string;
  durationRaw: string;
  guestsRaw: string;
  netPrice: number;
  referrer: string;
  checkInDate: string; // Jalali YYYY/MM/DD
  weekday?: string;
  realNights?: number;
  grossPrice?: number;
  commission?: number;
}

interface ChaletExport {
  version?: number;
  exportedAt?: string;
  bookings: ChaletBooking[];
  costs?: Record<string, unknown>;
  meta?: Record<string, { city?: string; notes?: string }>;
}

const dryRun = process.argv.includes("--dry-run");

if (!existsSync(DATA_FILE)) {
  console.error(`import:bookings: file not found: ${DATA_FILE}`);
  console.error("  run `npm run sync` first to copy the chalet export into data/");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as ChaletExport;
const bookings = raw.bookings ?? [];
const meta = raw.meta ?? {};

if (!bookings.length) {
  console.log("import:bookings: no bookings in export — nothing to do");
  process.exit(0);
}

const db = getDb();

const upsert = db.prepare(`
  INSERT OR REPLACE INTO bookings_history
    (id, customer_name, channel, net_amount, gross_amount, commission,
     check_in, nights, guests, is_hourly, customer_city, notes)
  VALUES
    (@id, @customer_name, @channel, @net_amount, @gross_amount, @commission,
     @check_in, @nights, @guests, @is_hourly, @customer_city, @notes)
`);

let imported = 0;
let skipped = 0;

const tx = db.transaction(() => {
  for (const b of bookings) {
    const iso = parseJalaliInput(b.checkInDate);
    if (!iso) {
      skipped++;
      continue;
    }
    const isHourly = String(b.durationRaw).includes("ساعته") ? 1 : 0;
    const nights = isHourly ? 1 : (b.realNights ?? (parseInt(b.durationRaw, 10) || 1));
    const guestsMatch = String(b.guestsRaw).match(/(\d+)\+?(\d*)/);
    const guests = guestsMatch
      ? Number(guestsMatch[1]) + (guestsMatch[2] ? Number(guestsMatch[2]) : 0)
      : null;
    const customerMeta = meta[b.name] ?? {};

    if (dryRun) {
      console.log(
        `  [dry] id=${b.id} ${b.name} | ${b.referrer} | ${iso} | ${nights}n | ${b.netPrice.toLocaleString()}`,
      );
      imported++;
      continue;
    }

    upsert.run({
      id: b.id,
      customer_name: b.name,
      channel: b.referrer,
      net_amount: b.netPrice,
      gross_amount: b.grossPrice ?? b.netPrice,
      commission: b.commission ?? 0,
      check_in: iso,
      nights,
      guests,
      is_hourly: isHourly,
      customer_city: customerMeta.city ?? "",
      notes: customerMeta.notes ?? "",
    });
    imported++;
  }
});

tx();

const total = (db.prepare("SELECT COUNT(*) as n FROM bookings_history").get() as { n: number }).n;
console.log(
  `import:bookings: ${dryRun ? "[dry-run] " : ""}${imported} imported, ${skipped} skipped (bad date) — table now has ${total} rows`,
);
