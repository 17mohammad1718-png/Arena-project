import { Card, Chip, EmptyState, Notice, PageHeader } from "@/components/ui";
import { toJalaliLong } from "@/lib/dates";
import { getDataset } from "@/lib/jajiga/dataset";
import { TONE_STYLES } from "@/lib/jajiga/insights";
import type { Insight, InsightTone } from "@/lib/jajiga/insights";
import { formatNumber, formatPercent, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "پیشنهادها" };

const ORDER: InsightTone[] = ["warning", "opportunity", "positive", "neutral"];

const GROUP_LABEL: Record<InsightTone, string> = {
  warning: "نیازمند اقدام",
  opportunity: "فرصت رشد",
  positive: "نقاط قوت",
  neutral: "برای اطلاع",
};

export default function InsightsPage() {
  const data = getDataset();

  if (data.isEmpty) {
    return <Notice tone="warning">داده‌ای برای تولید پیشنهاد موجود نیست.</Notice>;
  }

  const grouped = ORDER.map((tone) => ({
    tone,
    items: data.insights.filter((insight) => insight.tone === tone),
  })).filter((group) => group.items.length);

  const ownerRealized = data.realizedLeaderboard?.find((row) => row.isOwn);

  return (
    <div className="space-y-6">
      <PageHeader
        title="پیشنهادهای عملی"
        description={`تحلیل خودکار وضعیت «${data.owner.title}» بر پایه داده واقعی جاجیگا در ${toJalaliLong(
          data.today,
        )}.`}
      />

      <Notice>
        هر پیشنهاد از یک قاعده مشخص و قابل ردیابی ساخته شده و عددهای پشت آن در همین کارت آمده است.
        این‌ها <strong>برآورد</strong> هستند و تصمیم نهایی با شماست.
      </Notice>

      {/* --------------------------- Situation summary -------------------------- */}
      <Card title="وضعیت فعلی در یک نگاه">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCell
            label="نرخ پایه در برابر بازار"
            value={`صدک ${formatNumber(data.market.pricePercentile)}`}
            detail={`${formatToman(data.owner.basePrice)} در برابر میانه ${formatToman(
              data.market.medianPrice,
            )}`}
          />
          <SummaryCell
            label="کیفیت در برابر بازار"
            value={`صدک ${formatNumber(data.market.ratingPercentile)}`}
            detail={`امتیاز ${formatNumber(data.owner.rating ?? 0, 1)} با ${formatNumber(
              data.owner.reviewsCount,
            )} نظر`}
          />
          <SummaryCell
            label="اشغال شب‌های پیش رو"
            value={formatPercent(data.calendarKpis.occupancyRate)}
            detail={`${formatNumber(data.calendarKpis.bookedNights)} از ${formatNumber(
              data.calendarKpis.availableNights,
            )} شب`}
          />
          <SummaryCell
            label="رتبه درآمد در منطقه"
            value={
              ownerRealized
                ? `${formatNumber(ownerRealized.rank)} از ${formatNumber(
                    data.realizedLeaderboard?.length ?? 0,
                  )}`
                : "—"
            }
            detail={ownerRealized ? formatToman(ownerRealized.net) : "بازه محقق‌شده ثبت نشده"}
          />
        </div>
      </Card>

      {/* ------------------------------- Insights ------------------------------- */}
      {grouped.length ? (
        grouped.map((group) => (
          <section key={group.tone}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
              {GROUP_LABEL[group.tone]}
              <span className="num rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-slate-400">
                {formatNumber(group.items.length)}
              </span>
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.items.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState
          title="پیشنهادی تولید نشد"
          description="با داده فعلی هیچ قاعده‌ای فعال نشد. پس از به‌روزرسانی دیتاست دوباره بررسی کنید."
        />
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const style = TONE_STYLES[insight.tone];

  return (
    <article className={`card p-4 ring-1 ${style.ring}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h4 className={`text-[13px] font-bold leading-relaxed ${style.text}`}>{insight.title}</h4>
        <Chip tone={style.chip}>{style.label}</Chip>
      </div>

      <p className="text-[12px] leading-relaxed text-slate-300">{insight.body}</p>

      {insight.action ? (
        <p className="mt-3 rounded-lg bg-white/4 p-2.5 text-[11px] leading-relaxed text-slate-300 ring-1 ring-white/6">
          <span className="font-bold text-slate-100">اقدام پیشنهادی: </span>
          {insight.action}
        </p>
      ) : null}

      {insight.evidence ? (
        <p className="mt-3 border-t border-white/8 pt-2.5 text-[10px] text-slate-500">
          مبنای محاسبه: {insight.evidence}
        </p>
      ) : null}
    </article>
  );
}

function SummaryCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="num mt-1 text-[15px] font-extrabold text-white">{value}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}
