import { Suspense } from "react";

import { PeriodTabs } from "@/components/period-tabs";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { DEMO_TODAY } from "@/lib/demo-data";
import { toJalaliLong } from "@/lib/dates";
import { TONE_STYLES, buildInsights } from "@/lib/insights";
import { loadDataset } from "@/lib/load-dataset";
import {
  computeKpis,
  computeMarketPosition,
  computeMonthlySeries,
  formatNumber,
  rankCompetitors,
} from "@/lib/metrics";
import { isPeriodKey, resolvePeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

export const metadata = { title: "پیشنهادها" };

const ORDER = ["warning", "opportunity", "positive", "neutral"] as const;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const periodKey = isPeriodKey(params.period) ? params.period : "last12";

  const dataset = loadDataset();
  const today = dataset.origin === "demo" ? DEMO_TODAY : undefined;
  const period = resolvePeriod(periodKey, dataset.range, today);

  const kpis = computeKpis(dataset, period);
  const monthly = computeMonthlySeries(dataset, period);
  const ranked = rankCompetitors(dataset.property, dataset.competitors);
  const peers = ranked.filter((c) => c.similarity >= 0.55);
  const benchmarkSet = peers.length >= 3 ? peers : ranked.slice(0, Math.min(6, ranked.length));
  const market = computeMarketPosition(dataset.property, benchmarkSet);

  const insights = buildInsights(dataset, kpis, market, monthly).sort(
    (a, b) => ORDER.indexOf(a.tone) - ORDER.indexOf(b.tone),
  );

  const counts = ORDER.map((tone) => ({
    tone,
    label: TONE_STYLES[tone].label,
    count: insights.filter((i) => i.tone === tone).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="پیشنهادهای عملی"
        description={`تحلیل خودکار بازه ${toJalaliLong(period.start)} تا ${toJalaliLong(
          period.end,
        )} بر پایه عملکرد شما و مقایسه با ${formatNumber(benchmarkSet.length)} اقامتگاه مشابه.`}
        action={
          <Suspense fallback={null}>
            <PeriodTabs active={periodKey} />
          </Suspense>
        }
      />

      <Notice>
        این پیشنهادها بر پایه قواعد شفاف و قابل بازبینی تولید می‌شوند، نه پیش‌بینی قطعی. هر کارت
        منبع استدلال خود را ذکر می‌کند تا بتوانید با شناخت خودتان از اقامتگاه، آن را بپذیرید یا رد
        کنید.
      </Notice>

      {counts.length ? (
        <div className="flex flex-wrap gap-2">
          {counts.map((item) => (
            <span
              key={item.tone}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${TONE_STYLES[item.tone].chip}`}
            >
              {item.label}
              <span className="num">{formatNumber(item.count)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {insights.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {insights.map((insight) => {
            const tone = TONE_STYLES[insight.tone];
            return (
              <Card key={insight.id} className={`border ${tone.border}`}>
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <h3 className="text-[13px] font-extrabold leading-relaxed text-white">
                    {insight.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${tone.chip}`}
                  >
                    {tone.label}
                  </span>
                </div>

                <p className="text-[12px] leading-relaxed text-slate-300">{insight.body}</p>

                {insight.action ? (
                  <div className="mt-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/8">
                    <p className="mb-1 text-[10px] font-bold text-brand-300">اقدام پیشنهادی</p>
                    <p className="text-[12px] leading-relaxed text-slate-200">{insight.action}</p>
                  </div>
                ) : null}

                {insight.evidence ? (
                  <p className="mt-2.5 text-[10px] text-slate-500">مبنا: {insight.evidence}</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="هنوز پیشنهادی تولید نشده است"
          description="برای تولید پیشنهاد به داده رزرو، قیمت و رقبا نیاز است. پس از بارگذاری دیتاست، این صفحه به‌صورت خودکار پر می‌شود."
        />
      )}
    </div>
  );
}
