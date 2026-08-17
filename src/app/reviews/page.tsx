import { Card, Chip, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { toJalaliLong } from "@/lib/dates";
import { getDataset } from "@/lib/jajiga/dataset";
import { formatNumber, formatPercent } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "نظرات" };

const SUB_RATING_LABELS: { key: keyof Sub; label: string }[] = [
  { key: "accuracy", label: "دقت آگهی" },
  { key: "communication", label: "برخورد میزبان" },
  { key: "cleanliness", label: "نظافت" },
  { key: "location", label: "موقعیت" },
  { key: "checkin", label: "فرایند تحویل" },
  { key: "value", label: "ارزش خرید" },
];

type Sub = {
  accuracy: number | null;
  communication: number | null;
  cleanliness: number | null;
  location: number | null;
  checkin: number | null;
  value: number | null;
};

export default function ReviewsPage() {
  const data = getDataset();
  const reviews = data.reviews;

  if (data.isEmpty || !reviews) {
    return (
      <Notice tone="warning" title="نظری ثبت نشده">
        فایل نظرات این اقامتگاه در <code className="font-mono">data/reviews/</code> پیدا نشد.
      </Notice>
    );
  }

  const { owner } = data;
  const cardCount = owner.reviewsCount;
  const apiCount = reviews.count;
  const missing = Math.max(cardCount - apiCount, 0);

  const subRatings = SUB_RATING_LABELS.map((item) => ({
    ...item,
    value: owner.subRatings[item.key],
  })).filter((item): item is { key: keyof Sub; label: string; value: number } => item.value !== null);

  const weakest = [...subRatings].sort((a, b) => a.value - b.value)[0] ?? null;
  const maxBucket = Math.max(...reviews.distribution.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحلیل نظرات مهمانان"
        description={`${formatNumber(apiCount)} نظر ثبت‌شده برای «${owner.title}» با میانگین ${formatNumber(
          reviews.averageRating ?? 0,
          2,
        )}.`}
      />

      <Notice>
        امتیازی که جاجیگا روی آگهی نشان می‌دهد میانگین <strong>۱۲ ماه اخیر</strong> است، در حالی که
        میانگین این صفحه از همه نظرهای دریافت‌شده محاسبه می‌شود؛ پس اختلاف جزئی طبیعی است.
        {missing > 0 ? (
          <>
            {" "}همچنین کارت آگهی {formatNumber(cardCount)} نظر اعلام می‌کند ولی رابط برنامه‌نویسی{" "}
            {formatNumber(apiCount)} نظر برگرداند؛ {formatNumber(missing)} نظر در دسترس نیست.
          </>
        ) : null}
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="میانگین امتیاز"
          value={formatNumber(reviews.averageRating ?? 0, 2)}
          hint={`صدک ${formatNumber(data.market.ratingPercentile)} در میان رقبا`}
          tone="positive"
        />
        <KpiCard
          label="تعداد نظر"
          value={formatNumber(apiCount)}
          hint={`میانه رقبا ${formatNumber(data.market.medianReviews)} نظر`}
          tone={apiCount < data.market.medianReviews ? "warning" : "default"}
        />
        <KpiCard
          label="نرخ پاسخ‌گویی"
          value={formatPercent(reviews.replyRate)}
          hint="پاسخ میزبان به نظر مهمان"
          tone={reviews.replyRate >= 0.8 ? "positive" : "warning"}
        />
        <KpiCard
          label="ضعیف‌ترین زیرمعیار"
          value={weakest ? formatNumber(weakest.value, 1) : "—"}
          hint={weakest ? weakest.label : "—"}
          tone={weakest && weakest.value < 4.9 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card title="توزیع امتیازها">
          <ul className="space-y-2.5">
            {reviews.distribution.map((bucket) => (
              <li key={bucket.stars} className="flex items-center gap-3">
                <span className="num w-10 shrink-0 text-[12px] text-slate-400">
                  {formatNumber(bucket.stars)} ★
                </span>
                <div className="flex-1">
                  <Meter
                    value={bucket.count / maxBucket}
                    tone={bucket.stars >= 4 ? "positive" : "warning"}
                  />
                </div>
                <span className="num w-8 shrink-0 text-left text-[12px] font-bold text-slate-200">
                  {formatNumber(bucket.count)}
                </span>
              </li>
            ))}
          </ul>
          {reviews.count > reviews.ratedCount ? (
            <p className="mt-3 text-[10px] text-slate-500">
              {formatNumber(reviews.count - reviews.ratedCount)} نظر بدون امتیاز عددی ثبت شده است.
            </p>
          ) : null}
        </Card>

        <Card title="ریز امتیازها" subtitle="پایین‌ترین ضلع، سریع‌ترین مسیر بهبود امتیاز کلی است.">
          <ul className="space-y-3">
            {subRatings.map((item) => (
              <li key={item.key}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12px] text-slate-200">
                    {item.label}
                    {weakest && item.key === weakest.key ? (
                      <Chip tone="warning" className="mr-1.5">
                        کمترین
                      </Chip>
                    ) : null}
                  </span>
                  <span className="num text-[12px] font-bold text-slate-100">
                    {formatNumber(item.value, 1)}
                  </span>
                </div>
                <Meter
                  value={item.value / 5}
                  tone={weakest && item.key === weakest.key ? "warning" : "positive"}
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {data.reviewTopics.length ? (
        <Card
          title="موضوع‌های تکرارشونده در نظرها"
          subtitle="بر پایه کلیدواژه‌های پرتکرار فارسی در متن نظرها."
        >
          <div className="space-y-3">
            {data.reviewTopics.map((topic) => (
              <div
                key={topic.topic}
                className={`rounded-xl p-3.5 ring-1 ${
                  topic.tone === "positive"
                    ? "bg-emerald-500/6 ring-emerald-500/20"
                    : "bg-rose-500/6 ring-rose-500/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[12px] font-bold ${
                      topic.tone === "positive" ? "text-emerald-200" : "text-rose-200"
                    }`}
                  >
                    {topic.topic}
                  </span>
                  <span className="num text-[11px] text-slate-400">
                    {formatNumber(topic.count)} نظر · {formatPercent(topic.share)}
                  </span>
                </div>
                {topic.sample ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    «{topic.sample}…»
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="آخرین نظرها">
        <ul className="space-y-3">
          {reviews.latest.map((review) => (
            <li key={review.id} className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-slate-100">
                  {review.user?.name ?? "مهمان"}
                </span>
                <div className="flex items-center gap-2">
                  {typeof review.rating === "number" ? (
                    <Chip tone={review.rating >= 4.5 ? "positive" : "warning"}>
                      {formatNumber(review.rating, 1)} ★
                    </Chip>
                  ) : null}
                  <span className="num text-[10px] text-slate-500">
                    {toJalaliLong(review.created_at.slice(0, 10))}
                  </span>
                </div>
              </div>

              <p className="text-[12px] leading-relaxed text-slate-300">{review.content}</p>

              {review.host_reply?.content ? (
                <div className="mt-2.5 rounded-lg border-r-2 border-brand-400/40 bg-white/3 p-2.5">
                  <p className="mb-1 text-[10px] font-bold text-brand-300">پاسخ شما</p>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {review.host_reply.content}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-amber-300/80">هنوز به این نظر پاسخ نداده‌اید.</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
