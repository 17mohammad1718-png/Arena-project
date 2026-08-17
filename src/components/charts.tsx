"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { formatNumber, formatPercent, formatToman, formatTomanShort } from "@/lib/metrics";
import type { MonthlyPoint } from "@/lib/jajiga/analytics";

const AXIS = { stroke: "rgba(148,163,184,0.25)" };
const GRID = "rgba(148,163,184,0.10)";

function TooltipBox({
  label,
  rows,
}: {
  label?: string;
  rows: { name: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-xl border border-white/12 bg-ink-850/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur">
      {label ? <p className="mb-1.5 font-bold text-slate-200">{label}</p> : null}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              {row.color ? (
                <span className="size-2 rounded-full" style={{ background: row.color }} />
              ) : null}
              {row.name}
            </span>
            <span className="num font-semibold text-slate-100">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Revenue + occupancy composed                       */
/* -------------------------------------------------------------------------- */

export function RevenueTrendChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" axisLine={AXIS} tickLine={false} reversed interval="preserveStartEnd" />
        <YAxis
          yAxisId="money"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatTomanShort(v)}
          width={62}
        />
        <YAxis
          yAxisId="rate"
          orientation="left"
          axisLine={false}
          tickLine={false}
          domain={[0, 1]}
          tickFormatter={(v: number) => formatPercent(v)}
          width={44}
        />
        <Tooltip
          cursor={{ stroke: "rgba(148,163,184,0.25)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: "درآمد ناخالص",
                    value: formatToman(Number(payload.find((p) => p.dataKey === "revenue")?.value ?? 0)),
                    color: "#22d3ee",
                  },
                  {
                    name: "شب رزروشده",
                    value: formatNumber(Number(payload[0]?.payload?.booked ?? 0)),
                    color: "#a78bfa",
                  },
                  {
                    name: "نرخ اشغال",
                    value: formatPercent(
                      Number(payload.find((p) => p.dataKey === "occupancyRate")?.value ?? 0),
                    ),
                    color: "#fbbf24",
                  },
                ]}
              />
            ) : null
          }
        />
        <Area
          yAxisId="money"
          type="monotone"
          dataKey="revenue"
          stroke="#22d3ee"
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
        <Line
          yAxisId="rate"
          type="monotone"
          dataKey="occupancyRate"
          stroke="#fbbf24"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#fbbf24" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 ADR / RevPAN                               */
/* -------------------------------------------------------------------------- */

export function RateChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="adrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="revpanFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f472b6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#f472b6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" axisLine={AXIS} tickLine={false} reversed interval="preserveStartEnd" />
        <YAxis
          orientation="right"
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatTomanShort(v)}
          width={62}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: "میانگین نرخ شبانه",
                    value: formatToman(Number(payload.find((p) => p.dataKey === "adr")?.value ?? 0)),
                    color: "#34d399",
                  },
                  {
                    name: "درآمد هر شب قابل رزرو",
                    value: formatToman(Number(payload.find((p) => p.dataKey === "revpan")?.value ?? 0)),
                    color: "#f472b6",
                  },
                ]}
              />
            ) : null
          }
        />
        <Area type="monotone" dataKey="adr" stroke="#34d399" strokeWidth={2} fill="url(#adrFill)" />
        <Area
          type="monotone"
          dataKey="revpan"
          stroke="#f472b6"
          strokeWidth={2}
          fill="url(#revpanFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Nights booked vs open                           */
/* -------------------------------------------------------------------------- */

export function NightsChart({ data }: { data: MonthlyPoint[] }) {
  const shaped = data.map((d) => ({
    ...d,
    openNights: Math.max(d.available - d.booked, 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" axisLine={AXIS} tickLine={false} reversed interval="preserveStartEnd" />
        <YAxis
          orientation="right"
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        <Tooltip
          cursor={{ fill: "rgba(148,163,184,0.06)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: "شب رزروشده",
                    value: formatNumber(
                      Number(payload.find((p) => p.dataKey === "booked")?.value ?? 0),
                    ),
                    color: "#22d3ee",
                  },
                  {
                    name: "شب خالی",
                    value: formatNumber(
                      Number(payload.find((p) => p.dataKey === "openNights")?.value ?? 0),
                    ),
                    color: "#475569",
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="booked" stackId="n" fill="#22d3ee" radius={[0, 0, 0, 0]} barSize={22} />
        <Bar dataKey="openNights" stackId="n" fill="#475569" radius={[4, 4, 0, 0]} barSize={22} opacity={0.6} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Competitor price bars                          */
/* -------------------------------------------------------------------------- */

export function PriceComparisonChart({
  data,
}: {
  data: { name: string; weekday: number; weekend: number; isHost: boolean }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatTomanShort(v)}
          orientation="top"
        />
        <YAxis
          type="category"
          dataKey="name"
          orientation="right"
          axisLine={false}
          tickLine={false}
          width={150}
          tick={{ fontSize: 11, fill: "#cbd5e1" }}
        />
        <Tooltip
          cursor={{ fill: "rgba(148,163,184,0.06)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: "روز عادی",
                    value: formatToman(Number(payload.find((p) => p.dataKey === "weekday")?.value ?? 0)),
                    color: "#22d3ee",
                  },
                  {
                    name: "آخر هفته",
                    value: formatToman(Number(payload.find((p) => p.dataKey === "weekend")?.value ?? 0)),
                    color: "#fbbf24",
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="weekday" barSize={9} radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={`wd-${entry.name}`} fill={entry.isHost ? "#06b6d4" : "#334155"} />
          ))}
        </Bar>
        <Bar dataKey="weekend" barSize={9} radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={`we-${entry.name}`} fill={entry.isHost ? "#f59e0b" : "#475569"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Price vs rating scatter                         */
/* -------------------------------------------------------------------------- */

export function PositioningChart({
  competitors,
  host,
}: {
  competitors: { name: string; price: number; rating: number; reviews: number }[];
  host: { name: string; price: number; rating: number; reviews: number };
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 12, right: 12, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          type="number"
          dataKey="price"
          name="قیمت"
          axisLine={AXIS}
          tickLine={false}
          tickFormatter={(v: number) => formatTomanShort(v)}
          domain={["dataMin - 300000", "dataMax + 300000"]}
        />
        <YAxis
          type="number"
          dataKey="rating"
          name="امتیاز"
          orientation="right"
          axisLine={AXIS}
          tickLine={false}
          domain={[4, 5.05]}
          tickFormatter={(v: number) => formatNumber(v, 1)}
          width={40}
        />
        <ZAxis type="number" dataKey="reviews" range={[60, 420]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as {
              name: string;
              price: number;
              rating: number;
              reviews: number;
            };
            return (
              <TooltipBox
                label={point.name}
                rows={[
                  { name: "قیمت روز عادی", value: formatToman(point.price) },
                  { name: "امتیاز", value: formatNumber(point.rating, 1) },
                  { name: "تعداد نظر", value: formatNumber(point.reviews) },
                ]}
              />
            );
          }}
        />
        <Scatter data={competitors} fill="#475569" fillOpacity={0.75} />
        <Scatter data={[host]} fill="#22d3ee" shape="star" />
        <ReferenceLine
          x={host.price}
          stroke="#22d3ee"
          strokeDasharray="4 4"
          strokeOpacity={0.45}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Rating radar                                */
/* -------------------------------------------------------------------------- */

export function RatingRadar({ data }: { data: { subject: string; score: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(148,163,184,0.18)" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#cbd5e1" }} />
        <Radar dataKey="score" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} strokeWidth={2} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                rows={[
                  {
                    name: String(payload[0].payload.subject),
                    value: formatNumber(Number(payload[0].value), 1),
                  },
                ]}
              />
            ) : null
          }
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Weekday demand profile                          */
/* -------------------------------------------------------------------------- */

export function WeekdayChart({
  data,
}: {
  data: { day: string; occupancy: number; adr: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" axisLine={AXIS} tickLine={false} reversed />
        <YAxis
          yAxisId="rate"
          orientation="right"
          axisLine={false}
          tickLine={false}
          domain={[0, 1]}
          tickFormatter={(v: number) => formatPercent(v)}
          width={44}
        />
        <YAxis
          yAxisId="money"
          orientation="left"
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatTomanShort(v)}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "rgba(148,163,184,0.06)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: "نرخ اشغال",
                    value: formatPercent(
                      Number(payload.find((p) => p.dataKey === "occupancy")?.value ?? 0),
                    ),
                    color: "#22d3ee",
                  },
                  {
                    name: "میانگین نرخ",
                    value: formatToman(Number(payload.find((p) => p.dataKey === "adr")?.value ?? 0)),
                    color: "#fbbf24",
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar yAxisId="rate" dataKey="occupancy" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={26} opacity={0.8} />
        <Line
          yAxisId="money"
          type="monotone"
          dataKey="adr"
          stroke="#fbbf24"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#fbbf24" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
