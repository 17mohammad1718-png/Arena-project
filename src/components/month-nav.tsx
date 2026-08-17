"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { jalaliMonthStart, shiftJalaliMonth, toJalaliMonthLabel } from "@/lib/dates";

export function MonthNav({ year, month }: { year: number; month: number }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (y: number, m: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("year", String(y));
    next.set("month", String(m));
    return `${pathname}?${next.toString()}`;
  };

  const prev = shiftJalaliMonth(year, month, -1);
  const nextMonth = shiftJalaliMonth(year, month, 1);
  const label = toJalaliMonthLabel(jalaliMonthStart(year, month));

  return (
    <div className="no-print flex items-center gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/8">
      {/* In RTL the "previous" control sits on the right. */}
      <Link
        href={href(prev.year, prev.month)}
        scroll={false}
        className="rounded-lg px-2.5 py-1.5 text-slate-300 transition hover:bg-white/8 hover:text-white"
        aria-label="ماه قبل"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <span className="num min-w-28 px-2 text-center text-[12px] font-bold text-slate-100">
        {label}
      </span>
      <Link
        href={href(nextMonth.year, nextMonth.month)}
        scroll={false}
        className="rounded-lg px-2.5 py-1.5 text-slate-300 transition hover:bg-white/8 hover:text-white"
        aria-label="ماه بعد"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
