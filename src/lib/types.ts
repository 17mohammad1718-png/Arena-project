import { z } from "zod";

/**
 * MizbanYar (میزبان‌یار) — canonical data contracts.
 *
 * Every entity is validated with zod so that a real host dataset dropped into
 * `data/` fails loudly and legibly instead of silently corrupting analytics.
 *
 * Dates are stored as ISO Gregorian `YYYY-MM-DD` strings internally and are
 * only converted to Jalali at render time.
 */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ باید به قالب YYYY-MM-DD میلادی باشد");

export const ratingBreakdownSchema = z.object({
  accuracy: z.number().min(0).max(5).optional(),
  hostBehavior: z.number().min(0).max(5).optional(),
  cleanliness: z.number().min(0).max(5).optional(),
  location: z.number().min(0).max(5).optional(),
  handover: z.number().min(0).max(5).optional(),
  valueForMoney: z.number().min(0).max(5).optional(),
});

export const propertySchema = z.object({
  id: z.string(),
  title: z.string(),
  listingCode: z.string().optional(),
  url: z.string().optional(),
  area: z.string(),
  city: z.string(),
  province: z.string(),
  propertyType: z.string(),
  capacity: z.number().int().positive(),
  extraCapacity: z.number().int().nonnegative().default(0),
  bedrooms: z.number().int().nonnegative(),
  builtAreaM2: z.number().nonnegative().optional(),
  landAreaM2: z.number().nonnegative().optional(),
  amenities: z.array(z.string()).default([]),
  basePrice: z.number().nonnegative(),
  weekendPrice: z.number().nonnegative().optional(),
  extraGuestFee: z.number().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewsCount: z.number().int().nonnegative().optional(),
  ratingBreakdown: ratingBreakdownSchema.optional(),
});

export const reservationStatus = z.enum(["completed", "upcoming", "cancelled"]);

export const reservationSchema = z.object({
  id: z.string(),
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.number().int().positive().default(2),
  status: reservationStatus.default("completed"),
  /** Total amount the guest paid for accommodation, before platform fees. */
  grossAmount: z.number().nonnegative(),
  /** Jajiga commission and payment fees for this reservation. */
  platformFee: z.number().nonnegative().default(0),
  /** Discount already reflected inside grossAmount, kept for transparency. */
  discount: z.number().nonnegative().default(0),
  /** Amount refunded to the guest for a cancellation. */
  refund: z.number().nonnegative().default(0),
  note: z.string().optional(),
});

export const blockedNightSchema = z.object({
  date: isoDate,
  /** `owner` = میزبان بسته، `maintenance` = تعمیرات، `personal` = استفاده شخصی */
  reason: z.enum(["owner", "maintenance", "personal", "other"]).default("owner"),
  note: z.string().optional(),
});

export const expenseSchema = z.object({
  id: z.string().optional(),
  date: isoDate,
  category: z.string(),
  amount: z.number().nonnegative(),
  note: z.string().optional(),
});

export const dailyPriceSchema = z.object({
  date: isoDate,
  price: z.number().nonnegative(),
  /** Publicly displayed availability on that date, when known. */
  available: z.boolean().optional(),
});

export const dailyViewsSchema = z.object({
  date: isoDate,
  views: z.number().int().nonnegative(),
  inquiries: z.number().int().nonnegative().default(0),
});

export const competitorSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  area: z.string(),
  distanceKm: z.number().nonnegative().optional(),
  propertyType: z.string(),
  capacity: z.number().int().positive(),
  bedrooms: z.number().int().nonnegative(),
  builtAreaM2: z.number().nonnegative().optional(),
  weekdayPrice: z.number().nonnegative(),
  weekendPrice: z.number().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewsCount: z.number().int().nonnegative().optional(),
  amenities: z.array(z.string()).default([]),
  /** Share of the next 30 public nights shown as unavailable (estimate only). */
  unavailableShare: z.number().min(0).max(1).optional(),
});

export type RatingBreakdown = z.infer<typeof ratingBreakdownSchema>;
export type Property = z.infer<typeof propertySchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type ReservationStatus = z.infer<typeof reservationStatus>;
export type BlockedNight = z.infer<typeof blockedNightSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type DailyPrice = z.infer<typeof dailyPriceSchema>;
export type DailyViews = z.infer<typeof dailyViewsSchema>;
export type Competitor = z.infer<typeof competitorSchema>;

export type DatasetOrigin = "demo" | "real" | "mixed";

export type EntityKey =
  | "property"
  | "reservations"
  | "blockedNights"
  | "expenses"
  | "dailyPrices"
  | "views"
  | "competitors";

export interface EntitySourceReport {
  key: EntityKey;
  label: string;
  /** Where the records finally came from. */
  origin: "demo" | "real";
  /** Relative path of the file that was loaded, when real. */
  file?: string;
  recordCount: number;
  /** Validation problems found while reading a real file. */
  issues: string[];
}

export interface Dataset {
  property: Property;
  reservations: Reservation[];
  blockedNights: BlockedNight[];
  expenses: Expense[];
  dailyPrices: DailyPrice[];
  views: DailyViews[];
  competitors: Competitor[];
  origin: DatasetOrigin;
  reports: EntitySourceReport[];
  /** Inclusive ISO bounds of the data actually present. */
  range: { start: string; end: string };
}
