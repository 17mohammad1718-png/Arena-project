"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Chip } from "./ui";
import type { CompetitorMatch } from "@/lib/jajiga/analytics";
import type { CompetitorNote, CompetitorSet } from "@/lib/db/market";
import { NOTE_LABEL_FA } from "@/lib/db/market";
import type { RoomProfile } from "@/lib/jajiga/load";
import { formatNumber, formatPercent, formatToman, median } from "@/lib/metrics";

type SortKey =
  | "similarity"
  | "basePrice"
  | "rating"
  | "reviewsCount"
  | "distanceKm"
  | "occupancy30"
  | "successBooks";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "similarity", label: "شباهت" },
  { key: "distanceKm", label: "فاصله" },
  { key: "basePrice", label: "نرخ پایه" },
  { key: "rating", label: "امتیاز" },
  { key: "reviewsCount", label: "نظرات" },
  { key: "occupancy30", label: "پر بودن ۳۰ شب" },
  { key: "successBooks", label: "رزرو موفق" },
];

export function CompetitorTable({
  competitors,
  owner,
  sets = [],
  notes = [],
}: {
  competitors: CompetitorMatch[];
  owner: RoomProfile;
  sets?: CompetitorSet[];
  notes?: CompetitorNote[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [village, setVillage] = useState("all");
  const [minCapacity, setMinCapacity] = useState(0);
  const [maxDistance, setMaxDistance] = useState(0);
  const [onlySimilar, setOnlySimilar] = useState(true);
  const [sort, setSort] = useState<SortKey>("similarity");
  const [descending, setDescending] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [setName, setSetName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const noteByRoom = useMemo(() => new Map(notes.map((n) => [n.roomId, n])), [notes]);

  async function saveSet() {
    if (!selected.size) return;
    const name = setName.trim();
    if (!name) return setSaveError("نام مجموعه را بنویسید");
    setSaveBusy(true);
    setSaveError(null);
    const response = await fetch("/api/competitor-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, roomIds: [...selected] }),
    });
    setSaveBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return setSaveError(body?.error ?? "ذخیره ناموفق بود");
    }
    setSetName("");
    router.refresh();
  }

  async function removeSet(id: number) {
    await fetch(`/api/competitor-sets?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  function loadSet(set: CompetitorSet) {
    setSelected(new Set(set.roomIds));
    setOnlySimilar(false);
  }

  const villages = useMemo(
    () => [...new Set(competitors.map((c) => c.village))].filter(Boolean).sort(),
    [competitors],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return competitors
      .filter((c) => {
        if (q && !`${c.title} ${c.village}`.includes(q)) return false;
        if (village !== "all" && c.village !== village) return false;
        if (minCapacity && c.capacity < minCapacity) return false;
        if (maxDistance && (c.distanceKm ?? 999) > maxDistance) return false;
        if (onlySimilar && c.similarity < 0.7) return false;
        return true;
      })
      .sort((a, b) => {
        const av = (a[sort] as number | null) ?? -Infinity;
        const bv = (b[sort] as number | null) ?? -Infinity;
        return descending ? bv - av : av - bv;
      });
  }, [competitors, query, village, minCapacity, maxDistance, onlySimilar, sort, descending]);

  const selectedRows = filtered.filter((c) => selected.has(c.id));
  const comparisonSet = selectedRows.length ? selectedRows : filtered;

  const stats = useMemo(() => {
    const prices = comparisonSet.map((c) => c.basePrice).filter((p) => p > 0);
    const ratings = comparisonSet
      .map((c) => c.rating)
      .filter((r): r is number => typeof r === "number");
    const occupancies = comparisonSet
      .map((c) => c.occupancy30)
      .filter((o): o is number => typeof o === "number");
    const books = comparisonSet.map((c) => c.successBooks).filter((b) => b > 0);
    return {
      count: comparisonSet.length,
      medianPrice: median(prices),
      medianRating: median(ratings),
      medianOccupancy: occupancies.length ? median(occupancies) : null,
      medianBooks: median(books),
    };
  }, [comparisonSet]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const priceGap = stats.medianPrice
    ? (owner.basePrice - stats.medianPrice) / stats.medianPrice
    : 0;

  return (
    <div className="space-y-4">
      {/* -------------------------------- Filters ------------------------------- */}
      <div className="card p-3.5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">جستجو در نام یا روستا</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="مثلاً کلبه سوئیسی"
              className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-brand-400/50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">روستا</span>
            <select
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] text-slate-100 outline-none focus:border-brand-400/50"
            >
              <option value="all">همه</option>
              {villages.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">
              حداقل ظرفیت:{" "}
              <span className="num text-slate-200">
                {minCapacity ? formatNumber(minCapacity) : "—"}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={12}
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
              max={20}
              step={1}
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={onlySimilar}
                onChange={(e) => setOnlySimilar(e.target.checked)}
                className="size-3.5 accent-cyan-400"
              />
              فقط اقامتگاه‌های واقعاً مشابه (شباهت بالای ۷۰٪)
            </label>
            <p className="text-[11px] text-slate-400">
              <span className="num font-bold text-slate-200">{formatNumber(filtered.length)}</span>{" "}
              نتیجه
              {selected.size ? (
                <>
                  {" "}—{" "}
                  <span className="num font-bold text-brand-300">
                    {formatNumber(selected.size)}
                  </span>{" "}
                  انتخاب‌شده
                </>
              ) : null}
            </p>
          </div>
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

        {/* --------------------------- Saved sets (N1) --------------------------- */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
          {sets.map((set) => (
            <span
              key={set.id}
              className="inline-flex items-center gap-1 rounded-lg bg-white/5 py-1 pr-2.5 pl-1 text-[11px] ring-1 ring-white/10"
            >
              <button
                type="button"
                onClick={() => loadSet(set)}
                className="font-bold text-slate-200 transition hover:text-brand-300"
                title={`بارگذاری ${formatNumber(set.roomIds.length)} اقامتگاه این مجموعه`}
              >
                {set.name}
                <span className="num mr-1 text-[10px] text-slate-500">
                  ({formatNumber(set.roomIds.length)})
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeSet(set.id)}
                className="rounded px-1 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                aria-label={`حذف مجموعه ${set.name}`}
              >
                ×
              </button>
            </span>
          ))}

          {selected.size ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="نام مجموعه، مثلاً همسایه‌های سیدکلا"
                className="w-52 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-brand-400/50"
              />
              <button
                type="button"
                onClick={saveSet}
                disabled={saveBusy}
                className="rounded-lg bg-brand-500/90 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                ذخیره انتخاب ({formatNumber(selected.size)})
              </button>
            </span>
          ) : sets.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              چند اقامتگاه را تیک بزنید و به‌عنوان مجموعه نام‌دار ذخیره کنید تا بعد از رفرش هم بماند.
            </p>
          ) : null}
          {saveError ? (
            <p className="text-[11px] font-bold text-rose-300">{saveError}</p>
          ) : null}
        </div>
      </div>

      {/* ------------------------------ Comparison ------------------------------ */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-100">
          {selectedRows.length ? "مقایسه با مجموعه انتخابی" : "مقایسه با همه نتایج فیلترشده"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompareCell
            label="نرخ پایه شما"
            value={formatToman(owner.basePrice)}
            compare={`میانه ${formatToman(stats.medianPrice)}`}
            gap={priceGap}
          />
          <CompareCell
            label="امتیاز شما"
            value={formatNumber(owner.rating ?? 0, 1)}
            compare={`میانه ${formatNumber(stats.medianRating, 1)}`}
            gap={
              stats.medianRating
                ? ((owner.rating ?? 0) - stats.medianRating) / stats.medianRating
                : 0
            }
          />
          <CompareCell
            label="رزروهای موفق شما"
            value={formatNumber(owner.successBooks)}
            compare={`میانه ${formatNumber(stats.medianBooks)}`}
            gap={
              stats.medianBooks
                ? (owner.successBooks - stats.medianBooks) / stats.medianBooks
                : null
            }
          />
          <CompareCell
            label="پر بودن تقویم شما"
            value={owner.occupancy30 !== null ? formatPercent(owner.occupancy30) : "—"}
            compare={
              stats.medianOccupancy !== null
                ? `میانه ${formatPercent(stats.medianOccupancy)}`
                : "بدون داده"
            }
            gap={
              owner.occupancy30 !== null && stats.medianOccupancy
                ? (owner.occupancy30 - stats.medianOccupancy) / stats.medianOccupancy
                : null
            }
          />
        </div>
      </div>

      {/* --------------------------------- Table -------------------------------- */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right">
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
                        sort === column.key
                          ? "text-brand-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {column.label}
                      {sort === column.key ? <span>{descending ? "↓" : "↑"}</span> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((room) => {
                const isSelected = selected.has(room.id);
                return (
                  <tr
                    key={room.id}
                    className={`border-b border-white/5 transition last:border-0 hover:bg-white/3 ${
                      isSelected ? "bg-brand-500/6" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(room.id)}
                        className="size-3.5 accent-cyan-400"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/competitors/${room.id}`}
                        className="block max-w-[280px] truncate text-[12px] font-medium text-slate-200 transition hover:text-brand-300"
                        title={`${room.title} — پرونده رقیب`}
                      >
                        {room.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-slate-500">{room.village}</span>
                        {noteByRoom.get(room.id)?.label ? (
                          <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold text-brand-300">
                            {NOTE_LABEL_FA[noteByRoom.get(room.id)!.label!]}
                          </span>
                        ) : null}
                        {room.reasons.slice(0, 2).map((reason) => (
                          <span
                            key={reason}
                            className="rounded bg-white/6 px-1.5 py-0.5 text-[9px] text-slate-400"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-300">
                      {formatNumber(room.capacity)} / {formatNumber(room.bedrooms)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`num text-[12px] font-bold ${
                          room.similarity >= 0.8
                            ? "text-emerald-300"
                            : room.similarity >= 0.7
                              ? "text-slate-200"
                              : "text-slate-500"
                        }`}
                      >
                        {formatPercent(room.similarity)}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-400">
                      {room.distanceKm !== null ? `${formatNumber(room.distanceKm, 1)} کیلومتر` : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-200">
                      {formatToman(room.basePrice)}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-300">
                      {room.rating !== null ? formatNumber(room.rating, 1) : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-400">
                      {formatNumber(room.reviewsCount)}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-400">
                      {room.occupancy30 !== null ? formatPercent(room.occupancy30) : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-slate-400">
                      {formatNumber(room.successBooks)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filtered.length ? (
          <p className="p-8 text-center text-[12px] text-slate-500">
            هیچ اقامتگاهی با این فیلترها پیدا نشد.
          </p>
        ) : null}
      </div>

      {/* -------------------------- Selected detail cards ------------------------ */}
      {selectedRows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {selectedRows.map((room) => (
            <div key={room.id} className="card p-4">
              <a
                href={room.url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-bold text-slate-100 transition hover:text-brand-300"
              >
                {room.title}
              </a>
              <p className="mt-1 text-[10px] text-slate-500">
                {room.village} · {room.propertyType}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <DetailRow label="نرخ پایه" value={formatToman(room.basePrice)} />
                <DetailRow
                  label="اختلاف با شما"
                  value={`${room.basePrice >= owner.basePrice ? "+" : "−"}${formatToman(
                    Math.abs(room.basePrice - owner.basePrice),
                  )}`}
                />
                <DetailRow
                  label="امتیاز"
                  value={room.rating !== null ? formatNumber(room.rating, 1) : "—"}
                />
                <DetailRow label="نظرات" value={formatNumber(room.reviewsCount)} />
                <DetailRow label="ظرفیت" value={`${formatNumber(room.capacity)} نفر`} />
                <DetailRow label="امکانات" value={formatNumber(room.featuresCount)} />
              </div>

              {room.features.filter((f) => !owner.features.includes(f)).length ? (
                <div className="mt-3 border-t border-white/8 pt-2.5">
                  <p className="mb-1.5 text-[10px] text-slate-500">امکاناتی که شما ندارید</p>
                  <div className="flex flex-wrap gap-1">
                    {room.features
                      .map((code, i) => ({ code, label: room.featureLabels[i] ?? code }))
                      .filter((f) => !owner.features.includes(f.code))
                      .slice(0, 6)
                      .map((f) => (
                        <Chip key={f.code} tone="warning">
                          {f.label}
                        </Chip>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
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
  const tone =
    gap === null
      ? "text-slate-400"
      : gap > 0.05
        ? "text-emerald-300"
        : gap < -0.05
          ? "text-amber-300"
          : "text-slate-400";

  return (
    <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/6">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="num mt-1 text-[15px] font-extrabold text-white">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{compare}</p>
      {gap !== null ? (
        <p className={`num mt-0.5 text-[10px] font-bold ${tone}`}>
          {gap >= 0 ? "+" : "−"}
          {formatPercent(Math.abs(gap))}
        </p>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="num text-[11px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}
