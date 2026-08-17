import { z } from "zod";

/**
 * Zod contracts for the real Jajiga files in `data/`.
 *
 * These mirror the structures documented in `docs/DATA-GUIDE.md`. They are
 * intentionally permissive (`.passthrough()`, most fields optional) because the
 * upstream API omits fields per room — we validate the shape we depend on and
 * ignore the rest rather than rejecting a whole file over one missing key.
 */

/**
 * Upstream exports occasionally send a number as a string (e.g. one room's
 * `host_id` is `"1501067"`). Coerce rather than reject the whole file.
 */
const looseNumber = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}, z.number());

const nullableNumber = looseNumber.nullable().optional();

/* ------------------------------ pricing-dataset ---------------------------- */

export const sleepArrangeSchema = z.object({
  space_id: z.number().optional(),
  single: z.number().optional(),
  double: z.number().optional(),
  mattress: z.number().optional(),
  sofa_bed: z.number().optional(),
  etc: z.string().optional(),
});

export const discountSchema = z.object({
  percent: z.number(),
  type: z.string().optional(),
  min_nights: z.number().optional(),
});

export const geoSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const pricingRoomSchema = z
  .object({
    id: looseNumber,
    village: z.string().nullable().optional(),
    village_slug: z.string().nullable().optional(),
    title: z.string(),
    url: z.string().nullable().optional(),
    status: z.string().nullable().optional(),

    bedrooms: nullableNumber,
    floor_area: nullableNumber,
    land_area: nullableNumber,
    guest_number: nullableNumber,
    max_guest_number: nullableNumber,
    sleep_arrange: z.array(sleepArrangeSchema).optional(),
    types: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),

    stays_min: nullableNumber,
    stays_max: nullableNumber,
    min_price: nullableNumber,
    extra_price: nullableNumber,
    cancellation_policy: z.string().nullable().optional(),

    is_plus: z.boolean().optional(),
    is_instant: z.boolean().optional(),
    is_clean: z.boolean().optional(),
    is_new: z.boolean().optional(),

    properties: z.array(z.string()).optional(),
    features: z.array(z.string()).optional(),
    feature_desc: z.record(z.string(), z.string()).optional(),
    features_count: nullableNumber,

    success_books: nullableNumber,
    rating: nullableNumber,
    reviews: nullableNumber,
    rating_accuracy: nullableNumber,
    rating_communication: nullableNumber,
    rating_cleanliness: nullableNumber,
    rating_location: nullableNumber,
    rating_checkin: nullableNumber,
    rating_value: nullableNumber,

    current_discount_percent: nullableNumber,
    discounts: z.array(discountSchema).nullable().optional(),

    pictures_count: nullableNumber,
    geo: geoSchema.nullable().optional(),

    host_id: nullableNumber,
    host_name: z.string().nullable().optional(),
    host_accept_rate: nullableNumber,
    host_response_time: nullableNumber,
    host_communication_rate: nullableNumber,

    occupancy_30: nullableNumber,
    occupancy_30_unavailable: nullableNumber,
    occupancy_30_total: nullableNumber,

    pool: nullableNumber,
    jacuzzi: nullableNumber,
    own: z.boolean().optional(),
  })
  .loose();

export const pricingDatasetSchema = z.array(pricingRoomSchema);

/* ---------------------------------- radar ---------------------------------- */

export const radarNightSchema = z
  .object({
    date: z.string(),
    price: nullableNumber,
    discount: nullableNumber,
    is_unavailable: z.boolean().optional(),
    is_manual_block: z.boolean().optional(),
    is_instant: z.boolean().optional(),
    is_weekend: z.boolean().optional(),
  })
  .loose();

export const radarFileSchema = z
  .object({
    room_id: looseNumber,
    meta: z
      .object({
        title: z.string().nullable().optional(),
        village: z.string().nullable().optional(),
        host_name: z.string().nullable().optional(),
        host_id: nullableNumber,
        min_price: nullableNumber,
        own: z.boolean().optional(),
      })
      .loose(),
    fetched_at: z.string().optional(),
    nights: z.array(radarNightSchema),
  })
  .loose();

export const radarConfigSchema = z
  .object({
    schema_version: z.number().optional(),
    revenue_start: z.string().optional(),
    rooms: z.array(
      z
        .object({
          id: z.number(),
          label: z.string().optional(),
          short_label: z.string().optional(),
          own: z.boolean().optional(),
        })
        .loose(),
    ),
  })
  .loose();

/* --------------------------------- revenue --------------------------------- */

export const revenueNightSchema = z
  .object({
    date: z.string(),
    price: looseNumber,
    effective_price: nullableNumber,
    discount: nullableNumber,
    weekend: z.boolean().optional(),
    holiday: z.boolean().optional(),
    peak: z.boolean().optional(),
  })
  .loose();

export const revenueRoomSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().nullable().optional(),
    host_name: z.string().nullable().optional(),
    host_id: nullableNumber,
    village: z.string().nullable().optional(),
    booked: looseNumber,
    free: looseNumber.optional(),
    gross: looseNumber,
    gross_discounted: nullableNumber,
    discount_total: nullableNumber,
    commission: looseNumber,
    net: looseNumber,
    nights: z.array(revenueNightSchema).optional(),
  })
  .loose();

/** Revenue files are either a bare array or `{ realized_range, rooms }`. */
export const revenueFileSchema = z.union([
  z.array(revenueRoomSchema),
  z
    .object({
      realized_range: z.string().optional(),
      rooms: z.array(revenueRoomSchema),
    })
    .loose(),
]);

/* --------------------------------- reviews --------------------------------- */

export const reviewSchema = z
  .object({
    id: looseNumber,
    content: z.string(),
    created_at: z.string(),
    rating: nullableNumber,
    user: z
      .object({
        id: nullableNumber,
        name: z.string().optional(),
        gender: z.string().optional(),
      })
      .loose()
      .optional(),
    host_reply: z
      .object({
        content: z.string().optional(),
        created_at: z.string().optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

export const reviewsFileSchema = z.array(reviewSchema);

/* ---------------------------------- sweep ---------------------------------- */

export const sweepRoomSchema = z
  .object({
    id: looseNumber,
    title: z.string(),
    province: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    price: nullableNumber,
    books: nullableNumber,
    rating: nullableNumber,
    reviews: nullableNumber,
    url: z.string().optional(),
  })
  .loose();

export const sweepFileSchema = z.array(sweepRoomSchema);

/* ------------------------------ manual blocks ------------------------------ */

/** `{ "_comment": "...", "3297585": ["2026-08-16"] }` */
export const manualBlocksSchema = z.record(z.string(), z.union([z.array(z.string()), z.string()]));

export type PricingRoom = z.infer<typeof pricingRoomSchema>;
export type RadarFile = z.infer<typeof radarFileSchema>;
export type RadarNight = z.infer<typeof radarNightSchema>;
export type RadarConfig = z.infer<typeof radarConfigSchema>;
export type RevenueRoom = z.infer<typeof revenueRoomSchema>;
export type RevenueNight = z.infer<typeof revenueNightSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type SweepRoom = z.infer<typeof sweepRoomSchema>;
