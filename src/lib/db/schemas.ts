import { z } from "zod";

/** Shared zod schemas for host-data input — used by both API routes and forms. */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ باید به شکل YYYY-MM-DD میلادی باشد");

export const EXPENSE_CATEGORIES = [
  "cleaning",
  "linen",
  "utilities",
  "repairs",
  "supplies",
  "transport",
  "misc",
] as const;

export const EXPENSE_CATEGORY_LABEL: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  cleaning: "نظافت",
  linen: "ملحفه و شست‌وشو",
  utilities: "شارژ و قبوض",
  repairs: "تعمیرات",
  supplies: "خرید وسایل",
  transport: "ایاب و ذهاب",
  misc: "متفرقه",
};

export const expenseInput = z.object({
  date: isoDate,
  amount: z.number().int().positive("مبلغ باید بزرگ‌تر از صفر باشد"),
  category: z.enum(EXPENSE_CATEGORIES).default("misc"),
  note: z.string().max(500).default(""),
});
export type ExpenseInput = z.infer<typeof expenseInput>;

export interface ExpenseRow extends ExpenseInput {
  id: number;
  recurringId: number | null;
  createdAt: string;
}

export const recurringInput = z.object({
  title: z.string().min(1, "عنوان لازم است").max(120),
  amount: z.number().int().positive(),
  category: z.enum(EXPENSE_CATEGORIES).default("misc"),
  dayOfMonth: z.number().int().min(1).max(31).default(1),
  active: z.boolean().default(true),
});
export type RecurringInput = z.infer<typeof recurringInput>;

export interface RecurringRow extends RecurringInput {
  id: number;
  createdAt: string;
}

export const reservationInput = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.number().int().min(1).max(50).nullable().default(null),
    grossAmount: z.number().int().min(0),
    discountAmount: z.number().int().min(0).default(0),
    source: z.enum(["manual", "import"]).default("manual"),
    status: z.enum(["confirmed", "cancelled"]).default("confirmed"),
    note: z.string().max(500).default(""),
  })
  .refine((r) => r.checkOut > r.checkIn, {
    message: "تاریخ خروج باید بعد از تاریخ ورود باشد",
    path: ["checkOut"],
  })
  .refine((r) => r.discountAmount <= r.grossAmount, {
    message: "تخفیف نمی‌تواند از مبلغ کل بیشتر باشد",
    path: ["discountAmount"],
  });
export type ReservationInput = z.infer<typeof reservationInput>;

export interface ReservationRow extends ReservationInput {
  id: number;
  createdAt: string;
}

export const blockInput = z.object({
  date: isoDate,
  reason: z.string().max(300).default(""),
});
export type BlockInput = z.infer<typeof blockInput>;

export interface BlockRow extends BlockInput {
  id: number;
  createdAt: string;
}
