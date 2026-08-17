/**
 * `npm run sync` — copy the latest pipeline outputs from the jajiga-tracker
 * project into this repo's `data/`, then snapshot the fresh slice into the
 * local history DB (automates the manual `npm run archive` step).
 *
 * The pipeline (Hermes / jajiga-tracker) is the single writer of datasets
 * (see docs/DATA-GUIDE.md §7, refresh-runbook.md). This repo mirrors a fixed,
 * explicit set of targets (SYNC_TARGETS below) because the two projects do
 * not share a layout: pricing files live under the pipeline's data/pricing/
 * subdir, and the unified exports are written to the TRACKER PROJECT ROOT.
 * Anything outside the map is never touched or deleted.
 *
 * Usage:
 *   npm run sync                    copy changed files + archive
 *   npm run sync -- --dry-run       show what would change, write nothing
 *   npm run sync -- --source <dir>  override the tracker project root
 *   npm run sync -- --quiet         print nothing when nothing changed (cron)
 *
 * Exit codes: 0 ok · 1 bad source · 2 copy/archive failure.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { getDb } from "../src/lib/db";
import {
  archiveRadarPrices,
  archiveRealized,
  countPriceCaptures,
} from "../src/lib/db/archive";
import type { RadarNightSnapshot, RealizedRoomSnapshot } from "../src/lib/db/archive";

const DEST = path.join(process.cwd(), "data");

/**
 * Pipeline-side path (relative to jajiga-tracker project root) → this repo's
 * `data/` path. Directory targets are mirrored (add/update/remove inside);
 * file targets are copied when missing or different, never deleted.
 * `include` (optional, dir targets only): only top-level entries matching the
 * pattern are synced; everything else in the dest dir is left untouched —
 * this keeps pipeline-internal files (e.g. radar_history.db, history/)
 * out of the public mirror.
 */
const SYNC_TARGETS: ReadonlyArray<{ src: string; dst: string; include?: RegExp }> = [
  // Directory mirrors — the shared dataset groups. Radar carries pipeline
  // internals (history/, radar_history.db, snapshots/) that must not sync.
  { src: "data/radar", dst: "radar", include: /^(\d+\.json|radar-config\.json)$/ },
  { src: "data/revenue", dst: "revenue" },
  { src: "data/reviews", dst: "reviews" },
  { src: "data/snapshots", dst: "snapshots" },
  { src: "data/supply", dst: "supply" },
  // Root-level dataset files.
  { src: "data/all-cabins.json", dst: "all-cabins.json" },
  { src: "data/hosts-babolkenar.json", dst: "hosts-babolkenar.json" },
  { src: "data/manual-blocks.json", dst: "manual-blocks.json" },
  { src: "data/rooms_meta_cache.json", dst: "rooms_meta_cache.json" },
  { src: "data/supply-data.json", dst: "supply-data.json" },
  { src: "data/top_rooms_sweep.json", dst: "top_rooms_sweep.json" },
  // Pricing dataset lives in the pipeline's data/pricing/ subdir.
  { src: "data/pricing/pricing-dataset.json", dst: "pricing-dataset.json" },
  { src: "data/pricing/pricing-dataset.csv", dst: "pricing-dataset.csv" },
  { src: "data/pricing/gonehkola-pricing.json", dst: "gonehkola-pricing.json" },
  { src: "data/pricing/quran_talar-pricing.json", dst: "quran_talar-pricing.json" },
  { src: "data/pricing/seydkola-pricing.json", dst: "seydkola-pricing.json" },
  { src: "data/pricing/shirdarkola-pricing.json", dst: "shirdarkola-pricing.json" },
  // Unified exports are written to the jajiga-tracker PROJECT ROOT.
  { src: "jajiga_master.json", dst: "jajiga_master.json" },
  { src: "jajiga_complete_dataset.json", dst: "jajiga_complete_dataset.json" },
];

/** Names the mirror never touches or deletes (pipeline scratch / local). */
const LOCAL_PATTERN = /\.local\./;

interface DiffEntry {
  kind: "add" | "update" | "remove";
  srcAbs: string;
  dstAbs: string;
  /** Destination-relative path, e.g. `data/radar/3297585.json`. */
  display: string;
  isDir: boolean;
}

/* ------------------------------- CLI parsing ------------------------------ */

const args = process.argv.slice(2);
const opts = { dryRun: false, quiet: false, source: "" };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--dry-run" || a === "-n") opts.dryRun = true;
  else if (a === "--quiet" || a === "-q") opts.quiet = true;
  else if (a === "--source" || a === "-s") opts.source = args[i + 1] ?? "";
  else if (a.startsWith("--source=")) opts.source = a.slice("--source=".length);
}

/** jajiga-tracker PROJECT ROOT (contains data/ + the master exports). */
const TRACKER_ROOT = path.resolve(
  opts.source
    ? opts.source
    : process.env.JAJIGA_TRACKER_ROOT
      ? process.env.JAJIGA_TRACKER_ROOT
      : path.join(process.cwd(), "..", "jajiga-tracker"),
);

function fail(message: string, code: number): never {
  console.error(`sync-data: ${message}`);
  process.exit(code);
}

if (!existsSync(TRACKER_ROOT)) {
  fail(
    `jajiga-tracker project root not found: ${TRACKER_ROOT}\n` +
      "  pass --source <dir> or set JAJIGA_TRACKER_ROOT",
    1,
  );
}
if (!existsSync(path.join(TRACKER_ROOT, "data"))) {
  fail(`${TRACKER_ROOT} does not look like the jajiga-tracker root (no data/ dir)`, 1);
}
if (path.resolve(TRACKER_ROOT) === path.resolve(DEST)) {
  fail("source and destination are the same directory", 1);
}

/* ------------------------------ diff planning ----------------------------- */

function hashFile(fullPath: string): string {
  return createHash("md5").update(readFileSync(fullPath)).digest("hex");
}

function isLocal(name: string): boolean {
  return name === "tmp" || LOCAL_PATTERN.test(name);
}

function displayOf(dstRel: string): string {
  return path.posix.join("data", dstRel);
}

/** Mirror a source directory into dst (add/update/remove the contents). */
function collectDirDiff(
  srcDir: string,
  dstDir: string,
  dstRel: string,
  include: RegExp | undefined,
  out: DiffEntry[],
): void {
  const srcEntries = readdirSync(srcDir, { withFileTypes: true });
  const srcCandidates = srcEntries.filter(
    (e) => !isLocal(e.name) && (!include || include.test(e.name)),
  );
  const srcNames = new Set(srcCandidates.map((e) => e.name));

  const dstExists = existsSync(dstDir);
  const dstNames = dstExists ? readdirSync(dstDir) : [];

  for (const name of dstNames) {
    if (srcNames.has(name) || isLocal(name)) continue;
    if (include && !include.test(name)) continue; // never remove out-of-scope entries
    const full = path.join(dstDir, name);
    out.push({
      kind: "remove",
      srcAbs: "",
      dstAbs: full,
      display: displayOf(path.posix.join(dstRel, name)),
      isDir: statSync(full).isDirectory(),
    });
  }

  for (const entry of srcCandidates) {
    const relPath = path.posix.join(dstRel, entry.name);
    const srcFull = path.join(srcDir, entry.name);
    const dstFull = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      if (existsSync(dstFull) && !statSync(dstFull).isDirectory()) {
        out.push({ kind: "remove", srcAbs: "", dstAbs: dstFull, display: displayOf(relPath), isDir: false });
      }
      collectDirDiff(srcFull, dstFull, relPath, include, out);
    } else if (entry.isFile()) {
      if (!existsSync(dstFull)) {
        out.push({ kind: "add", srcAbs: srcFull, dstAbs: dstFull, display: displayOf(relPath), isDir: false });
      } else if (hashFile(srcFull) !== hashFile(dstFull)) {
        out.push({ kind: "update", srcAbs: srcFull, dstAbs: dstFull, display: displayOf(relPath), isDir: false });
      }
    }
  }
}

function collectDiff(): { diff: DiffEntry[]; missing: string[] } {
  const diff: DiffEntry[] = [];
  const missing: string[] = [];

  for (const target of SYNC_TARGETS) {
    const srcFull = path.join(TRACKER_ROOT, target.src);
    const dstFull = path.join(DEST, target.dst);
    if (!existsSync(srcFull)) {
      // Source absent (e.g. master export not rebuilt yet) — keep the dest as-is.
      missing.push(target.src);
      continue;
    }
    if (statSync(srcFull).isDirectory()) {
      collectDirDiff(srcFull, dstFull, target.dst, target.include, diff);
    } else if (!existsSync(dstFull)) {
      diff.push({ kind: "add", srcAbs: srcFull, dstAbs: dstFull, display: displayOf(target.dst), isDir: false });
    } else if (hashFile(srcFull) !== hashFile(dstFull)) {
      diff.push({ kind: "update", srcAbs: srcFull, dstAbs: dstFull, display: displayOf(target.dst), isDir: false });
    }
  }
  return { diff, missing };
}

function applyDiff(out: DiffEntry[]): void {
  for (const e of out) {
    if (e.kind === "remove") {
      rmSync(e.dstAbs, { recursive: e.isDir, force: true });
      continue;
    }
    mkdirSync(path.dirname(e.dstAbs), { recursive: true });
    if (existsSync(e.dstAbs) && statSync(e.dstAbs).isDirectory()) {
      rmSync(e.dstAbs, { recursive: true, force: true });
    }
    copyFileSync(e.srcAbs, e.dstAbs);
  }
}

/* ------------------------------ archive step ------------------------------ */

const OWNER_ROOM_ID = 3297585;

/** Mirror scripts/archive.ts: realize + radar prices into the local DB. */
function runArchive(): { realized: number; radar: number; captures: number } {
  const db = getDb();

  let realizedAdded = 0;
  const realizedPath = path.join(DEST, "revenue", "realized-seydkola-mordad-1405.json");
  if (existsSync(realizedPath)) {
    const raw = JSON.parse(readFileSync(realizedPath, "utf8")) as {
      realized_range?: string;
      rooms?: Record<string, unknown>[];
    };
    const isoDates = (raw.realized_range ?? "").match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const [rangeStart, rangeEnd] = [isoDates[0], isoDates[1] ?? isoDates[0]];
    if (rangeStart && Array.isArray(raw.rooms)) {
      const rooms: RealizedRoomSnapshot[] = raw.rooms
        .map((room) => ({
          rangeStart,
          rangeEnd,
          roomId: Number((room as { id?: unknown }).id),
          payload: room,
        }))
        .filter((room) => Number.isFinite(room.roomId));
      realizedAdded = archiveRealized(db, rooms);
    }
  }

  let priceAdded = 0;
  const radarDir = path.join(DEST, "radar");
  if (existsSync(radarDir)) {
    const nights: RadarNightSnapshot[] = [];
    for (const file of readdirSync(radarDir)) {
      if (!/^\d+\.json$/.test(file)) continue;
      const raw = JSON.parse(readFileSync(path.join(radarDir, file), "utf8")) as {
        room_id?: number;
        fetched_at?: string;
        nights?: { date?: string; price?: number | null; is_unavailable?: boolean }[];
      };
      if (!raw.room_id || !Array.isArray(raw.nights)) continue;
      const capturedAt = (raw.fetched_at ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      for (const night of raw.nights) {
        if (!night.date) continue;
        nights.push({
          capturedAt,
          date: night.date,
          roomId: raw.room_id,
          price: typeof night.price === "number" ? night.price : null,
          isUnavailable: night.is_unavailable === true,
        });
      }
    }
    priceAdded = archiveRadarPrices(db, nights);
  }

  return { realized: realizedAdded, radar: priceAdded, captures: countPriceCaptures(db) };
}

/* ---------------------------------- main ---------------------------------- */

function main(): void {
  if (!opts.quiet) console.log(`tracker root: ${TRACKER_ROOT}`);
  if (opts.dryRun) console.log("dry-run: no files will be changed");

  const { diff, missing } = collectDiff();

  const adds = diff.filter((d) => d.kind === "add");
  const updates = diff.filter((d) => d.kind === "update");
  const removals = diff.filter((d) => d.kind === "remove");

  if (diff.length === 0) {
    if (opts.quiet && missing.length === 0) return; // silent exit for cron
    if (missing.length > 0) {
      console.log(`missing in source (kept local copy): ${missing.join(", ")}`);
    }
    if (!opts.quiet) console.log("nothing to sync — data is up to date");
    else console.log(`up to date (missing in source: ${missing.join(", ")})`);
    return;
  }

  if (!opts.quiet) {
    console.log(`added: ${adds.length}   updated: ${updates.length}   removed: ${removals.length}`);
    for (const e of diff.slice(0, 40)) {
      const tag = e.kind === "add" ? " + " : e.kind === "update" ? " ~ " : " - ";
      console.log(`${tag}${e.display}${e.isDir ? "/" : ""}`);
    }
    if (diff.length > 40) console.log(`  … and ${diff.length - 40} more`);
  }
  if (missing.length > 0 && !opts.quiet) {
    console.log(`missing in source (kept local copy): ${missing.join(", ")}`);
  }

  if (opts.dryRun) return;

  try {
    applyDiff(diff);
  } catch (error) {
    fail(`copy failed: ${(error as Error).message}`, 2);
  }

  try {
    const { realized, radar, captures } = runArchive();
    console.log(`archive: realized +${realized}, radar prices +${radar} (capture days: ${captures})`);
  } catch (error) {
    fail(`archive failed: ${(error as Error).message}`, 2);
  }

  console.log("sync complete");
}

main();
