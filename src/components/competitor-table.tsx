"use client";

import { useMemo, useState } from "react";

import { Chip } from "./ui";
import { formatNumber, formatPercent, formatToman, median } from "@/lib/metrics";
import type { CompetitorMatch } from "@/lib/metrics";
import type { Property } from "@/lib/types";

type SortKey = "similarity" | "weekdayPrice" | "weekendPrice" | "rating" | "reviewsCount" | "distanceKm";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "similarity", label: "شباهت", numeric: true },
  { key: "distanceKm", label: "فاصله", numeric: true },
  { key: "weekdayPrice", label: "روز عادی", numeric: true },
  { key: "weekendPrice", label: "آخر هفته", numeric: true },
  { key: "rating", label: "امتیاز", numeric: true },
  { key: "reviewsCount", label: "نظرات", numeric: true },
];

export function CompetitorTable({
  competitors,
  property,
}: {
  competitors: CompetitorMatch[];
  property: Property;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [minCapacity, setMinCapacity] = useState(0);
  const [maxDistance, setMaxDistance] = useState(0);
  const [sort, setSort] = useState<SortKey>("similarity");
  const [descending, setDescending] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const types = useMemo(
    () => [...new Set(competitors.map((c) => c.propertyType))].sort(),
    [competitors],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return competitors
      .filter((c) => {
        if (q && !`${c.title} ${c.area}`.includes(q)) return false;
        if (type !== "all" && c.propertyType !== type) return false;
        if (minCapacity && c.capacity < minCapacity) return false;
        if (maxDistance && (c.distanceKm ?? 999) > maxDistance) return false;
        return true;
      })
      .sort((a, b) => {
        const av = (a[sort] as number | undefined) ?? -Infinity;
        const bv = (b[sort] as number | undefined) ?? -Infinity;
        return descending ? bv - av : av - bv;
      });
  }, [competitors, query, type, minCapacity, maxDistance, sort, descending]);

  const selectedRows = filtered.filter((c) => selected.has(c.id));
  const comparisonSet = selectedRows.length ? selectedRows : filtered;

  const stats = useMemo(() => {
    const weekday = comparisonSet.map((c) => c.weekdayPrice).filter((p) => p > 0);
    const weekend = comparisonSet.map((c) => c.weekendPrice ?? c.weekdayPrice).filter((p) => p > 0);
    const ratings = comparisonSet
      .map((c) => c.rating)
      .filter((r): r is number => typeof r === "number");
    return {
      count: comparisonSet.length,
      medianWeekday: median(weekday),
      medianWeekend: median(weekend),
      medianRating: median(ratings),
    };
  }, [comparisonSet]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hostWeekend = property.weekendPrice ?? property.basePrice;
  const weekdayGap = stats.medianWeekday
    ? (property.basePrice - stats.medianWeekday) / stats.medianWeekday
    : 0;
  const weekendGap = stats.medianWeekend
    ? (hostWeekend - stats.medianWeekend) / stats.medianWeekend
    : 0;

  return (
    <div className="space-y-4">
      {/* -------------------------------- Filters ------------------------------- */}
      <div className="card p-3.5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">جستجو در نام یا منطقه</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="مثلاً بابلکنار"
              className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-brand-400/50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">نوع اقامتگاه</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] text-slate-100 outline-none focus:border-brand-400/50"
            >
              <option value="all">همه</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">
              حداقل ظرفیت: <span className="num text-slate-200">{minCapacity || "—"}</span>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              value={minCapacity}
              onChange={(e) => setMinCapacity(Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">
              حداکثر فاصله:{" "}
              <span className="num text-slate-200">
                {maxDistance ? `${formatNumber(maxDistance)} کیلومتر` : "بدون محدودیت"}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              step={2}
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
          <p className="text-[11px] text-slate-400">
            <span className="num font-bold text-slate-200">{formatNumber(filtered.length)}</span> رقیب
            نمایش داده می‌شود
            {selected.size ? (
              <>
                {" "}— <span className="num font-bold text-brand-300">{formatNumber(selected.size)}</span>{" "}
                مورد برای مقایسه انتخاب شده
              </>
            ) : null}
          </p>
          {selected.size ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg bg-white/6 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              پاک‌کردن انتخاب
            </button>
          ) : null}
        </div>
      </div>

      {/* ------------------------------ Comparison ------------------------------ */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-100">
          {selectedRows.length ? "مقایسه با مجموعه انتخابی" : "مقایسه با همه رقبای فیلترشده"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompareCell
            label="قیمت روز عادی شما"
            value={formatToman(property.basePrice)}
            compare={`میانه ${formatToman(stats.medianWeekday)}`}
            gap={weekdayGap}
          />
          <CompareCell
            label="قیمت آخر هفته شما"
            value={formatToman(hostWeekend)}
            compare={`میانه ${formatToman(stats.medianWeekend)}`}
            gap={weekendGap}
          />
          <CompareCell
            label="امتیاز شما"
            value={formatNumber(property.rating ?? 0, 1)}
            compare={`میانه ${formatNumber(stats.medianRating, 1)}`}
            gap={
              stats.medianRating
                ? ((property.rating ?? 0) - stats.medianRating) / stats.medianRating
                : 0
            }
          />
          <CompareCell
            label="ظرفیت شما"
            value={`${formatNumber(property.capacity)} نفر`}
            compare={`+${formatNumber(property.extraCapacity)} نفر اضافه`}
            gap={null}
          />
        </div>
      </div>

      {/* --------------------------------- Table -------------------------------- */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-4xl text-right">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400">اقامتگاه</th>
                <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400">ظرفیت / اتاق</th>
                {COLUMNS.map((column) => (
                  <th key={column.key} className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (sort === column.key) setDescending((d) => !d);
                        else {
                          setSort(column.key);
                          setDescending(true);
                        }
                      }}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold transition ${
                        sort === column.key ? "text-brand-300" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {column.label}
                      {sort === column.key ? <span>{descending ? "▾" : "▴"}</span> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((competitor) => {
                const isSelected = selected.has(competitor.id);
                return (
                  <tr
                    key={competitor.id}
                    className={`border-b border-white/5 transition last:border-0 ${
                      isSelected ? "bg-brand-500/8" : "hover:bg-white/3"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(competitor.id)}
                        className="size-3.5 accent-cyan-500"
                        aria-label={`انتخاب ${competitor.title}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-slate-100">
                        {competitor.url ? (
                          <a
                            href={competitor.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-brand-300"
                          >
                            {competitor.title}
                          </a>
                        ) : (
                          competitor.title
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {competitor.area} · {competitor.propertyType}
                      </p>
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-300">
                      {formatNumber(competitor.capacity)} / {formatNumber(competitor.bedrooms)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-600"
                            style={{ width: `${competitor.similarity * 100}%` }}
                          />
                        </div>
                        <span className="num text-[11px] text-slate-400">
                          {formatPercent(competitor.similarity)}
                        </span>
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-300">
                      {competitor.distanceKm !== undefined
                        ? `${formatNumber(competitor.distanceKm, 1)} کیلومتر`
                        : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] font-semibold text-slate-100">
                      {formatToman(competitor.weekdayPrice)}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-amber-200">
                      {formatToman(competitor.weekendPrice ?? competitor.weekdayPrice)}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-300">
                      {competitor.rating !== undefined ? formatNumber(competitor.rating, 1) : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-400">
                      {competitor.reviewsCount !== undefined
                        ? formatNumber(competitor.reviewsCount)
                        : "—"}
                    </td>
                  </tr>
                );
              })}

              {!filtered.length ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-[12px] text-slate-500">
                    هیچ رقیبی با این فیلترها پیدا نشد.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------ Match reasons --------------------------- */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-100">چرا این‌ها رقیب شما هستند؟</h3>
        <div className="grid gap-2.5 md:grid-cols-2">
          {filtered.slice(0, 6).map((competitor) => (
            <div key={competitor.id} className="rounded-xl bg-white/4 p-3 ring-1 ring-white/6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-100">{competitor.title}</p>
                <span className="num shrink-0 text-[11px] font-bold text-brand-300">
                  {formatPercent(competitor.similarity)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {competitor.reasons.length ? (
                  competitor.reasons.map((reason) => (
                    <Chip key={reason} tone="brand">
                      {reason}
                    </Chip>
                  ))
                ) : (
                  <Chip>شباهت ضعیف — با احتیاط مقایسه کنید</Chip>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompareCell({
  label,
  value,
  compare,
  gap,
}: {
  label: string;
  value: string;
  compare: string;
  gap: number | null;
}) {
  return (
    <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/6">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="num mt-1 text-[15px] font-extrabold text-white">{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className="num text-[10px] text-slate-500">{compare}</p>
        {gap !== null && Math.abs(gap) >= 0.01 ? (
          <span
            className={`num rounded px-1 py-0.5 text-[9px] font-bold ${
              gap > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {gap > 0 ? "+" : "−"}
            {formatPercent(Math.abs(gap))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
