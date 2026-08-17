import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { featureLabel, propertyTypeLabel } from "./features";
import {
  manualBlocksSchema,
  pricingDatasetSchema,
  radarConfigSchema,
  radarFileSchema,
  reviewsFileSchema,
  revenueFileSchema,
  sweepFileSchema,
} from "./schemas";
import type {
  PricingRoom,
  RadarConfig,
  RadarFile,
  RevenueRoom,
  Review,
  SweepRoom,
} from "./schemas";

export const DATA_DIR = path.join(process.cwd(), "data");
export const OWNER_ROOM_ID = 3297585;

/* -------------------------------------------------------------------------- */
/*                              Low-level readers                             */
/* -------------------------------------------------------------------------- */

export interface LoadIssue {
  file: string;
  message: string;
}

const issues: LoadIssue[] = [];

function readJson<T>(
  relativePath: string,
  parse: (raw: unknown) => T,
  fallback: T,
): T {
  const full = path.join(DATA_DIR, relativePath);
  if (!existsSync(full)) {
    issues.push({ file: relativePath, message: "فایل یافت نشد" });
    return fallback;
  }
  try {
    return parse(JSON.parse(readFileSync(full, "utf8")));
  } catch (error) {
    issues.push({ file: relativePath, message: (error as Error).message.slice(0, 200) });
    return fallback;
  }
}

export function getLoadIssues(): LoadIssue[] {
  return issues;
}

/* -------------------------------------------------------------------------- */
/*                                 Raw loaders                                */
/* -------------------------------------------------------------------------- */

export function loadPricingRooms(): PricingRoom[] {
  return readJson(
    "pricing-dataset.json",
    (raw) => pricingDatasetSchema.parse(raw),
    [] as PricingRoom[],
  );
}

export function loadSweep(): SweepRoom[] {
  return readJson("top_rooms_sweep.json", (raw) => sweepFileSchema.parse(raw), [] as SweepRoom[]);
}

export function loadRadarConfig(): RadarConfig | null {
  return readJson<RadarConfig | null>(
    path.join("radar", "radar-config.json"),
    (raw) => radarConfigSchema.parse(raw),
    null,
  );
}

export function loadRadarRooms(): RadarFile[] {
  const dir = path.join(DATA_DIR, "radar");
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
  const rooms: RadarFile[] = [];

  for (const file of files) {
    try {
      const parsed = radarFileSchema.parse(
        JSON.parse(readFileSync(path.join(dir, file), "utf8")),
      );
      rooms.push(parsed);
    } catch (error) {
      issues.push({ file: `radar/${file}`, message: (error as Error).message.slice(0, 200) });
    }
  }

  return rooms;
}

export function loadRadarRoom(roomId: number): RadarFile | null {
  return readJson<RadarFile | null>(
    path.join("radar", `${roomId}.json`),
    (raw) => radarFileSchema.parse(raw),
    null,
  );
}

/** `{ roomId: Set<isoDate> }` of nights the host closed for non-guest reasons. */
export function loadManualBlocks(): Map<number, Set<string>> {
  const raw = readJson<Record<string, string[] | string>>(
    "manual-blocks.json",
    (value) => manualBlocksSchema.parse(value),
    {},
  );

  const map = new Map<number, Set<string>>();
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue; // `_comment`
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const dates = Array.isArray(value) ? value : [value];
    map.set(id, new Set(dates));
  }
  return map;
}

function normalizeRevenueFile(raw: unknown): RevenueRoom[] {
  const parsed = revenueFileSchema.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.rooms;
}

export interface RevenueSnapshot {
  file: string;
  label: string;
  range?: string;
  rooms: RevenueRoom[];
}

/** All revenue snapshots in `data/revenue/`, newest-looking first. */
export function loadRevenueSnapshots(): RevenueSnapshot[] {
  const dir = path.join(DATA_DIR, "revenue");
  if (!existsSync(dir)) return [];

  const snapshots: RevenueSnapshot[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      const rooms = normalizeRevenueFile(raw);
      const range =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as { realized_range?: string }).realized_range
          : undefined;
      snapshots.push({
        file,
        label: file.replace(/\.json$/, ""),
        range,
        rooms,
      });
    } catch (error) {
      issues.push({ file: `revenue/${file}`, message: (error as Error).message.slice(0, 200) });
    }
  }
  return snapshots;
}

export function loadReviews(roomId: number): Review[] {
  return readJson(
    path.join("reviews", `${roomId}_reviews.json`),
    (raw) => reviewsFileSchema.parse(raw),
    [] as Review[],
  );
}

export function listReviewRoomIds(): number[] {
  const dir = path.join(DATA_DIR, "reviews");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => f.match(/^(\d+)_reviews\.json$/)?.[1])
    .filter((v): v is string => Boolean(v))
    .map(Number);
}

/* -------------------------------------------------------------------------- */
/*                            Normalised view models                          */
/* -------------------------------------------------------------------------- */

export interface RoomProfile {
  id: number;
  title: string;
  url: string;
  village: string;
  isOwn: boolean;
  status: string;

  propertyType: string;
  types: string[];
  bedrooms: number;
  floorArea: number | null;
  landArea: number | null;
  capacity: number;
  maxCapacity: number;
  beds: { double: number; mattress: number; single: number; sofaBed: number };

  basePrice: number;
  extraGuestFee: number | null;
  minStay: number | null;
  cancellationPolicy: string | null;
  discounts: { percent: number; minNights: number | null }[];
  currentDiscountPercent: number;

  /** Machine codes, e.g. `pool`. */
  features: string[];
  /** Persian labels, e.g. `استخر`. */
  featureLabels: string[];
  featureDescriptions: Record<string, string>;
  featuresCount: number;
  badges: string[];
  isPlus: boolean;
  isInstant: boolean;

  rating: number | null;
  reviewsCount: number;
  successBooks: number;
  subRatings: {
    accuracy: number | null;
    communication: number | null;
    cleanliness: number | null;
    location: number | null;
    checkin: number | null;
    value: number | null;
  };

  host: {
    id: number | null;
    name: string | null;
    acceptRate: number | null;
    responseTimeMinutes: number | null;
    communicationRate: number | null;
  };

  /** Share of the public 30-night window shown as unavailable (an estimate). */
  occupancy30: number | null;
  occupancy30Booked: number;
  occupancy30Total: number;

  geo: { lat: number; lng: number } | null;
  picturesCount: number;
}

function num(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNum(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toRoomProfile(room: PricingRoom): RoomProfile {
  const beds = (room.sleep_arrange ?? []).reduce(
    (acc: RoomProfile["beds"], space) => ({
      double: acc.double + num(space.double),
      mattress: acc.mattress + num(space.mattress),
      single: acc.single + num(space.single),
      sofaBed: acc.sofaBed + num(space.sofa_bed),
    }),
    { double: 0, mattress: 0, single: 0, sofaBed: 0 },
  );

  const features = room.features ?? [];
  const unavailable = num(room.occupancy_30_unavailable);
  const totalWindow = num(room.occupancy_30_total, 30);

  return {
    id: room.id,
    title: room.title,
    url: room.url ?? `https://www.jajiga.com/room/${room.id}`,
    village: room.village ?? "—",
    isOwn: room.own === true || room.id === OWNER_ROOM_ID,
    status: room.status ?? "unknown",

    propertyType: propertyTypeLabel(room.types),
    types: room.types ?? [],
    bedrooms: num(room.bedrooms),
    floorArea: nullableNum(room.floor_area),
    landArea: nullableNum(room.land_area),
    capacity: num(room.guest_number, 2),
    maxCapacity: num(room.max_guest_number, num(room.guest_number, 2)),
    beds,

    basePrice: num(room.min_price),
    extraGuestFee: nullableNum(room.extra_price),
    minStay: nullableNum(room.stays_min),
    cancellationPolicy: room.cancellation_policy ?? null,
    discounts: (room.discounts ?? []).map((d) => ({
      percent: d.percent,
      minNights: nullableNum(d.min_nights),
    })),
    currentDiscountPercent: num(room.current_discount_percent),

    features,
    featureLabels: features.map(featureLabel),
    featureDescriptions: room.feature_desc ?? {},
    featuresCount: num(room.features_count, features.length),
    badges: room.properties ?? [],
    isPlus: room.is_plus === true,
    isInstant: room.is_instant === true,

    rating: nullableNum(room.rating),
    reviewsCount: num(room.reviews),
    successBooks: num(room.success_books),
    subRatings: {
      accuracy: nullableNum(room.rating_accuracy),
      communication: nullableNum(room.rating_communication),
      cleanliness: nullableNum(room.rating_cleanliness),
      location: nullableNum(room.rating_location),
      checkin: nullableNum(room.rating_checkin),
      value: nullableNum(room.rating_value),
    },

    host: {
      id: nullableNum(room.host_id),
      name: room.host_name ?? null,
      acceptRate: nullableNum(room.host_accept_rate),
      responseTimeMinutes: nullableNum(room.host_response_time),
      communicationRate: nullableNum(room.host_communication_rate),
    },

    occupancy30: totalWindow > 0 ? unavailable / totalWindow : null,
    occupancy30Booked: unavailable,
    occupancy30Total: totalWindow,

    geo: room.geo ?? null,
    picturesCount: num(room.pictures_count),
  };
}

/**
 * Load every Babolkenar room, dropping listings whose fetch failed upstream
 * (they only carry an id/price stub and would distort medians).
 */
export function loadRoomProfiles(): RoomProfile[] {
  return loadPricingRooms()
    .filter((room) => room.status !== "fetch_failed")
    .map(toRoomProfile);
}

export function findOwnerProfile(rooms: RoomProfile[]): RoomProfile | null {
  return rooms.find((room) => room.isOwn) ?? null;
}
