/**
 * Shared numeric helpers and Persian formatters.
 *
 * Domain analytics live in `src/lib/jajiga/` next to the real dataset; this
 * module stays deliberately free of any data-shape knowledge.
 */

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** Share of `values` that are strictly below `value`, as a 0–100 percentile. */
export function percentileOf(values: number[], value: number): number {
  if (!values.length) return 0;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return ((below + equal / 2) / values.length) * 100;
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/* -------------------------------------------------------------------------- */
/*                             Persian formatting                             */
/* -------------------------------------------------------------------------- */

const faNumber = new Intl.NumberFormat("fa-IR");

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Toman with Persian digits, e.g. `۲٬۴۰۰٬۰۰۰ تومان`. */
export function formatToman(value: number): string {
  return `${faNumber.format(Math.round(value))} تومان`;
}

/** Compact toman for chart axes and tight cards, e.g. `۲۴٫۵ م`. */
export function formatTomanShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 1)} میلیارد`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} م`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 0)} هزار`;
  return formatNumber(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${formatNumber(value * 100, digits)}٪`;
}

export function formatRating(value: number): string {
  return formatNumber(value, 1);
}
