"use client";

/**
 * Full, sortable/filterable reviews table — the "professional table"
 * standard: sticky header, centered cells, monospace digits, three-state
 * column sort, rating/reply/year chips, live search, click-to-expand host
 * replies, and a theme-jump signal that filters the word, scrolls into view
 * and flashes the first rows.
 */
import { useEffect, useMemo, useState } from "react";

import { formatNumber } from "@/lib/metrics";

export interface ReviewRow {
  id: number;
  dateISO: string;
  jDisplay: string;
  /** Jalali year — used by the year filter. */
  jy: number;
  user: string;
  rating: number; // 0 when the guest left no numeric rating
  content: string;
  reply: boolean;
  replyTxt: string;
  replyDateISO: string;
}

/** Theme-card jump request: filter for a word and bring the table up. */
export interface JumpSignal {
  word: string;
  nonce: number;
}

type SortCol = "date" | "user" | "rating" | "reply";
type SortDir = "desc" | "asc";

const MAX_ROWS = 400;

const RATING_FILTERS: { v: number | null; label: string }[] = [
  { v: null, label: "همه" },
  { v: 5, label: "فقط ۵" },
  { v: 4.8, label: "۴.۸ به بالا" },
  { v: 4.5, label: "۴.۵ به بالا" },
];

const REPLY_FILTERS: { v: "has" | "none" | null; label: string }[] = [
  { v: null, label: "همه" },
  { v: "has", label: "دارد" },
  { v: "none", label: "ندارد" },
];

function sortValue(row: ReviewRow, col: SortCol): number | string {
  switch (col) {
    case "date":
      return Date.parse(row.dateISO);
    case "rating":
      return row.rating;
    case "reply":
      return row.reply ? 1 : 0;
    case "user":
      return row.user;
  }
}

export function ReviewsTable({
  rows,
  total,
  jump,
}: {
  rows: ReviewRow[];
  total: number;
  jump: JumpSignal | null;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [reply, setReply] = useState<"has" | "none" | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [col, setCol] = useState<SortCol | null>(null);
  const [dir, setDir] = useState<SortDir | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.jy))].sort((a, b) => b - a),
    [rows],
  );

  /* ------------------------------ theme jump ------------------------------ */
  useEffect(() => {
    if (!jump) return;
    setSearch(jump.word);
    setRating(null);
    setReply(null);
    setYear(null);
    setCol(null);
    setDir(null);
    setFlashActive(true);
    const timer = window.setTimeout(() => setFlashActive(false), 2400);

    const panel = document.getElementById("reviews-table-panel");
    if (panel) {
      const rectTop = panel.getBoundingClientRect().top + window.scrollY;
      try {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        /* older engines */
      }
      try {
        window.scrollTo({ top: Math.max(0, rectTop - 14), behavior: "smooth" });
      } catch {
        /* older engines */
      }
      // The Hermes preview pane renders the page inside a content-sized
      // iframe; the real scrollbar lives in the parent document.
      try {
        const parentWin = window.parent as Window | null;
        if (parentWin && parentWin.document) {
          const innerTop = panel.getBoundingClientRect().top;
          parentWin.scrollTo({
            top: Math.max(0, (parentWin.scrollY ?? 0) + innerTop - 14),
            behavior: "smooth",
          });
        }
      } catch {
        /* cross-origin ignore */
      }
    }
    return () => window.clearTimeout(timer);
  }, [jump?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------------------- filtering ----------------------------- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (rating !== null && r.rating < rating) return false;
        if (reply === "has" && !r.reply) return false;
        if (reply === "none" && r.reply) return false;
        if (year !== null && r.jy !== year) return false;
        if (q && !`${r.user} ${r.content}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (!col || !dir) return 0;
        const av = sortValue(a, col);
        const bv = sortValue(b, col);
        if (av < bv) return dir === "desc" ? 1 : -1;
        if (av > bv) return dir === "desc" ? -1 : 1;
        return 0;
      });
  }, [rows, rating, reply, year, search, col, dir]);

  const shown = filtered.slice(0, MAX_ROWS);

  function toggleSort(next: SortCol) {
    if (col !== next) {
      setCol(next);
      setDir("desc");
    } else if (dir === "desc") {
      setDir("asc");
    } else {
      setCol(null);
      setDir(null);
    }
  }

  function toggleReply(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetAll() {
    setRating(null);
    setReply(null);
    setYear(null);
    setSearch("");
    setCol(null);
    setDir(null);
  }

  const groupBtn = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[12px] transition-colors ${
      on
        ? "border-brand-400/70 bg-brand-400/20 text-brand-200"
        : "border-white/10 bg-white/4 text-slate-400 hover:border-brand-400/40"
    }`;

  return (
    <section id="reviews-table-panel" className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
        <span>امتیاز:</span>
        <div className="flex flex-wrap gap-1.5">
          {RATING_FILTERS.map((f) => (
            <button
              key={f.label}
              className={groupBtn(rating === f.v)}
              onClick={() => setRating(f.v)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="mr-2">پاسخ میزبان:</span>
        <div className="flex flex-wrap gap-1.5">
          {REPLY_FILTERS.map((f) => (
            <button
              key={f.label}
              className={groupBtn(reply === f.v)}
              onClick={() => setReply(f.v)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="mr-2">سال شمسی:</span>
        <div className="flex flex-wrap gap-1.5">
          <button className={groupBtn(year === null)} onClick={() => setYear(null)}>
            همه
          </button>
          {years.map((y) => (
            <button key={y} className={groupBtn(year === y)} onClick={() => setYear(y)}>
              <span className="num">{y}</span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="جستجو در متن و نام کاربر…"
          className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-[13px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-brand-400/50"
        />
        <button className={groupBtn(false)} onClick={resetAll}>
          بازنشانی
        </button>
      </div>

      <p className="mb-2 text-[12px] text-slate-500">
        نمایش <span className="num text-slate-300">{shown.length}</span> از{" "}
        <span className="num text-slate-300">{filtered.length}</span> نظر — مجموع نظرات اقامتگاه:{" "}
        <span className="num text-slate-300">{formatNumber(total)}</span>
        {filtered.length > MAX_ROWS ? " (بیش از ۴۰۰ — با فیلتر محدود کنید)" : null}
        {search ? (
          <button
            className="mr-2 rounded-full border border-brand-400/60 bg-brand-400/10 px-2.5 py-0.5 text-[11px] text-brand-200"
            onClick={() => {
              setSearch("");
              setCol(null);
              setDir(null);
            }}
          >
            فیلتر: «{search}» ✕
          </button>
        ) : null}
      </p>

      <div className="max-h-[85vh] overflow-auto rounded-xl border border-white/8">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-slate-400">
                #
              </th>
              <th
                className="sticky top-0 z-10 cursor-pointer select-none bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-slate-400 hover:bg-slate-800"
                onClick={() => toggleSort("date")}
              >
                تاریخ {col === "date" ? <span className="num">{dir === "desc" ? "▼" : "▲"}</span> : null}
              </th>
              <th
                className="sticky top-0 z-10 cursor-pointer select-none bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-slate-400 hover:bg-slate-800"
                onClick={() => toggleSort("user")}
              >
                کاربر {col === "user" ? <span className="num">{dir === "desc" ? "▼" : "▲"}</span> : null}
              </th>
              <th
                className="sticky top-0 z-10 cursor-pointer select-none bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-slate-400 hover:bg-slate-800"
                onClick={() => toggleSort("rating")}
              >
                امتیاز {col === "rating" ? <span className="num">{dir === "desc" ? "▼" : "▲"}</span> : null}
              </th>
              <th className="sticky top-0 z-10 bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-slate-400">
                متن نظر
              </th>
              <th
                className="sticky top-0 z-10 cursor-pointer select-none bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-slate-400 hover:bg-slate-800"
                onClick={() => toggleSort("reply")}
              >
                پاسخ میزبان {col === "reply" ? <span className="num">{dir === "desc" ? "▼" : "▲"}</span> : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length ? (
              shown.map((row, index) => {
                const flash = flashActive && index < 5;
                const open = expanded.has(row.id);
                return (
                  <RowGroup
                    key={row.id}
                    row={row}
                    index={index}
                    open={open}
                    flash={flash}
                    onToggleReply={() => toggleReply(row.id)}
                  />
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[13px] text-slate-500">
                  موردی یافت نشد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowGroup({
  row,
  index,
  open,
  flash,
  onToggleReply,
}: {
  row: ReviewRow;
  index: number;
  open: boolean;
  flash: boolean;
  onToggleReply: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-white/6 text-center transition-colors ${
          index % 2 ? "bg-white/2" : ""
        } ${flash ? "bg-teal-400/25" : "hover:bg-white/5"}`}
      >
        <td className="num px-3 py-2.5 text-[12px] text-slate-500">{index + 1}</td>
        <td className="px-3 py-2.5">
          <div className="text-[12px] font-bold text-slate-200">{row.jDisplay}</div>
          <div className="num text-[10px] text-slate-500" dir="ltr">
            {row.dateISO}
          </div>
        </td>
        <td className="px-3 py-2.5 text-[12.5px] font-semibold text-slate-200">{row.user}</td>
        <td className="px-3 py-2.5">
          {row.rating > 0 ? (
            <span
              className={`num text-[13px] font-bold ${
                row.rating >= 4.5 ? "text-amber-300" : row.rating >= 3 ? "text-orange-300" : "text-rose-300"
              }`}
            >
              {formatNumber(row.rating, 1)} ★
            </span>
          ) : (
            <span className="text-[12px] text-slate-500">—</span>
          )}
        </td>
        <td className="max-w-[480px] min-w-[300px] px-3 py-2.5 text-right text-[12.5px] leading-relaxed text-slate-300">
          <span className="block whitespace-pre-wrap break-words">{row.content}</span>
        </td>
        <td className="px-3 py-2.5">
          {row.reply ? (
            <button
              onClick={onToggleReply}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors ${
                open
                  ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300"
                  : "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
              }`}
            >
              پاسخ میزبان <span className={`num text-[10px] ${open ? "rotate-180" : ""}`}>▾</span>
            </button>
          ) : (
            <span className="text-[12px] text-slate-500">— بدون پاسخ</span>
          )}
        </td>
      </tr>
      {row.reply && open ? (
        <tr className="border-b border-white/6 bg-emerald-950/30">
          <td colSpan={6} className="px-4 py-3 text-right">
            <p className="mb-1 text-[11px] font-bold text-emerald-300">
              پاسخ میزبان
              {row.replyDateISO ? (
                <span className="num mx-1.5 font-normal text-slate-500" dir="ltr">
                  {row.replyDateISO}
                </span>
              ) : null}
            </p>
            <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-slate-300">
              {row.replyTxt}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}
