"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber, formatToman } from "@/lib/metrics";

const AXIS = { stroke: "rgba(148,163,184,0.25)" };
const GRID = "rgba(148,163,184,0.10)";

export interface MonthlyNetPoint {
  label: string;
  net: number;
  count: number;
}

function TooltipBox({
  label,
  rows,
}: {
  label?: string;
  rows: { name: string; value: string }[];
}) {
  return (
    <div className="rounded-xl border border-white/12 bg-ink-850/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur">
      {label ? <p className="mb-1.5 font-bold text-slate-200">{label}</p> : null}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-4">
            <span className="text-slate-400">{row.name}</span>
            <span className="num font-semibold text-slate-100">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomersMonthlyChart({ data }: { data: MonthlyNetPoint[] }) {
  if (!data.length) {
    return <p className="py-8 text-center text-[12px] text-slate-500">داده‌ای نیست</p>;
  }

  return (
    <div className="h-56" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={AXIS} tickLine={false} />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M`}
            width={36}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as MonthlyNetPoint;
              return (
                <TooltipBox
                  label={String(label)}
                  rows={[
                    { name: "خالص", value: formatToman(point.net) },
                    { name: "رزرو", value: formatNumber(point.count) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="net" fill="#34d399" radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
