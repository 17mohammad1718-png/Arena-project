"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Alert } from "@/lib/alerts";

/** «نیاز به توجه» — daily alerts with per-alert dismiss (plan N4). */
export function AlertsPanel({
  alerts,
  ids,
}: {
  alerts: Alert[];
  /** alert_log row id per ruleKey, for dismissal. */
  ids: Record<string, number>;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!alerts.length) return null;

  async function dismiss(ruleKey: string) {
    const id = ids[ruleKey];
    if (!id) return;
    setBusyKey(ruleKey);
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusyKey(null);
    router.refresh();
  }

  return (
    <section className="card p-4 lg:p-5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100">
          نیاز به توجه
          <span className="num mr-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            {alerts.length}
          </span>
        </h3>
        <p className="text-[10px] text-slate-500">هر مورد حداکثر یک‌بار در روز ظاهر می‌شود</p>
      </header>

      <div className="space-y-2.5">
        {alerts.map((alert) => (
          <div
            key={alert.ruleKey}
            className={`rounded-xl p-3.5 ring-1 ${
              alert.severity === "warning"
                ? "bg-amber-400/6 ring-amber-400/20"
                : "bg-white/4 ring-white/8"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-[13px] font-bold ${
                    alert.severity === "warning" ? "text-amber-200" : "text-slate-100"
                  }`}
                >
                  {alert.title}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{alert.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={alert.href}
                    className="text-[11px] font-bold text-brand-300 transition hover:text-brand-200"
                  >
                    {alert.action} ←
                  </Link>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(alert.ruleKey)}
                disabled={busyKey === alert.ruleKey}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] text-slate-500 transition hover:bg-white/8 hover:text-slate-300 disabled:opacity-40"
                title="نادیده گرفتن برای امروز"
              >
                نادیده بگیر
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
