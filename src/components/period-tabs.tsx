"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { PERIOD_OPTIONS } from "@/lib/period";
import type { PeriodKey } from "@/lib/period";

export function PeriodTabs({ active }: { active: PeriodKey }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="no-print flex flex-wrap gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/8">
      {PERIOD_OPTIONS.map((option) => {
        const next = new URLSearchParams(params.toString());
        next.set("period", option.key);
        const isActive = option.key === active;
        return (
          <Link
            key={option.key}
            href={`${pathname}?${next.toString()}`}
            scroll={false}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
              isActive
                ? "bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
