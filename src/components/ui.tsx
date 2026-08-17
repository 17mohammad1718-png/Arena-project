import type { ReactNode } from "react";

import { IconArrowDown, IconArrowUp, IconInfo } from "./icons";

/* --------------------------------- Section -------------------------------- */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-white lg:text-2xl">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`card p-4 lg:p-5 ${className}`}>
      {title ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{title}</h3>
            {subtitle ? <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------- KPI ---------------------------------- */

export function KpiCard({
  label,
  value,
  hint,
  delta,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; positive: boolean } | null;
  icon?: ReactNode;
  tone?: "default" | "brand" | "positive" | "warning";
}) {
  const toneRing =
    tone === "brand"
      ? "ring-brand-500/25 bg-brand-500/6"
      : tone === "positive"
        ? "ring-emerald-500/20 bg-emerald-500/6"
        : tone === "warning"
          ? "ring-rose-500/20 bg-rose-500/6"
          : "ring-white/8";

  return (
    <div className={`card card-hover p-4 ring-1 ${toneRing}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        {icon ? <span className="text-slate-500">{icon}</span> : null}
      </div>
      <p className="num mt-2 text-lg font-extrabold tracking-tight text-white lg:text-xl">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              delta.positive
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {delta.positive ? (
              <IconArrowUp className="size-3" />
            ) : (
              <IconArrowDown className="size-3" />
            )}
            <span className="num">{delta.value}</span>
          </span>
        ) : null}
        {hint ? <p className="text-[10px] leading-tight text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

/* --------------------------------- Chips ---------------------------------- */

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "positive" | "warning" | "danger";
}) {
  const styles = {
    neutral: "bg-white/6 text-slate-300 ring-white/10",
    brand: "bg-brand-500/12 text-brand-200 ring-brand-500/25",
    positive: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/25",
    warning: "bg-amber-500/12 text-amber-300 ring-amber-500/25",
    danger: "bg-rose-500/12 text-rose-300 ring-rose-500/25",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${styles}`}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Notice --------------------------------- */

export function Notice({
  children,
  tone = "info",
  title,
}: {
  children: ReactNode;
  tone?: "info" | "warning";
  title?: string;
}) {
  const styles =
    tone === "warning"
      ? "border-amber-500/25 bg-amber-500/8 text-amber-100"
      : "border-sky-500/25 bg-sky-500/8 text-sky-100";

  return (
    <div className={`flex gap-3 rounded-xl border p-3.5 text-[12px] leading-relaxed ${styles}`}>
      <IconInfo className="mt-0.5 size-4 shrink-0 opacity-80" />
      <div>
        {title ? <p className="mb-1 font-bold">{title}</p> : null}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Progress bar ----------------------------- */

export function Meter({
  value,
  tone = "brand",
  label,
}: {
  /** 0–1 */
  value: number;
  tone?: "brand" | "positive" | "warning";
  label?: string;
}) {
  const width = `${Math.min(Math.max(value, 0), 1) * 100}%`;
  const bar =
    tone === "positive"
      ? "bg-emerald-400"
      : tone === "warning"
        ? "bg-amber-400"
        : "bg-gradient-to-l from-brand-400 to-brand-600";

  return (
    <div>
      {label ? <p className="mb-1 text-[11px] text-slate-400">{label}</p> : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <div className={`h-full rounded-full ${bar}`} style={{ width }} />
      </div>
    </div>
  );
}

/* ------------------------------- Definition ------------------------------- */

export function DefinitionList({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-[12px] text-slate-400">{item.term}</dt>
          <dd className="num text-[13px] font-semibold text-slate-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="card grid place-items-center p-10 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}
