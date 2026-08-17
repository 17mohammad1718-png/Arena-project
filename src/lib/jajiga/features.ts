/**
 * Jajiga amenity/type code → Persian label.
 *
 * The API returns machine codes in `features[]`; the UI must never show raw
 * English codes to a Persian host.
 */
export const FEATURE_LABELS: Record<string, string> = {
  barbecue: "منقل و باربیکیو",
  bathroom: "حمام",
  billiard: "بیلیارد",
  cooler: "سیستم سرمایشی",
  drawer: "کمد و دراور",
  electricity: "برق",
  essentials: "ملزومات اولیه",
  firealarm: "دتکتور حریق",
  fireextingu: "کپسول آتش‌نشانی",
  firstaidkit: "جعبه کمک‌های اولیه",
  food: "پذیرایی و غذا",
  foosball: "فوتبال‌دستی",
  furniture: "مبلمان",
  hairdryer: "سشوار",
  heating: "سیستم گرمایشی",
  iron: "اتو",
  islamictoilet: "سرویس بهداشتی",
  jacuzzi: "جکوزی",
  janitor: "سرایدار",
  kitchen: "آشپزخانه",
  microwave: "مایکروویو",
  parking: "پارکینگ",
  pool: "استخر",
  refrigerator: "یخچال",
  safetycard: "کارت ایمنی",
  stave: "اجاق گاز",
  table: "میز غذاخوری",
  toilet: "سرویس ایرانی",
  tv: "تلویزیون",
  vacuumcleaner: "جاروبرقی",
  washer: "ماشین لباسشویی",
  water: "آب لوله‌کشی",
};

export function featureLabel(code: string): string {
  return FEATURE_LABELS[code] ?? code;
}

/** Amenities that plausibly move price/demand — used for insight ranking. */
export const HIGH_VALUE_FEATURES = new Set([
  "pool",
  "jacuzzi",
  "barbecue",
  "billiard",
  "washer",
  "microwave",
  "janitor",
  "food",
]);

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  cottage: "کلبه",
  swiss_cottage: "کلبه سوئیسی",
  wooden_cottage: "کلبه چوبی",
  ecolog: "بومگردی",
  villa: "ویلا",
  apartment: "آپارتمان",
  suite: "سوئیت",
};

/**
 * Turn the `types[]` array into one readable label, preferring the most
 * specific type (swiss_cottage beats the generic cottage).
 */
export function propertyTypeLabel(types: string[] | undefined): string {
  if (!types?.length) return "اقامتگاه";
  const priority = ["swiss_cottage", "wooden_cottage", "ecolog", "villa", "suite", "apartment", "cottage"];
  for (const key of priority) {
    if (types.includes(key)) return PROPERTY_TYPE_LABELS[key] ?? key;
  }
  return PROPERTY_TYPE_LABELS[types[0]] ?? types[0];
}

export const CANCELLATION_LABELS: Record<string, string> = {
  easy: "آسان",
  middle: "متوسط",
  hard: "سخت‌گیرانه",
  strict: "سخت‌گیرانه",
};

/** Jajiga takes a 12% commission on the nightly rate. */
export const COMMISSION_RATE = 0.12;
