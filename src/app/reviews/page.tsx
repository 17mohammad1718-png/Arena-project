import Link from "next/link";

import { Card, Chip, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { ReviewsDashboard } from "@/components/reviews-dashboard";
import type { ReviewRow } from "@/components/reviews-table";
import { jalaliParts, toJalaliLong } from "@/lib/dates";
import { analyzeReviews } from "@/lib/jajiga/analytics";
import { getDataset } from "@/lib/jajiga/dataset";
import {
  OWNER_ROOM_ID,
  listReviewRoomIds,
  loadReviews,
} from "@/lib/jajiga/load";
import { analyzeReviewDashboard } from "@/lib/jajiga/reviewAnalytics";
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

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  const data = getDataset();
  const available = listReviewRoomIds();
  const requested = Number(room);
  const roomId =
    Number.isFinite(requested) && available.includes(requested) ? requested : OWNER_ROOM_ID;
  const isOwner = roomId === OWNER_ROOM_ID;

  const roomReviews = loadReviews(roomId);
  if (!roomReviews.length) {
    return (
      <Notice tone="warning" title="نظری ثبت نشده">
        فایل نظرات این اقامتگاه در <code className="font-mono">data/reviews/</code> پیدا نشد.
      </Notice>
    );
  }

  const reviews = analyzeReviews(roomReviews);
  const insights = analyzeReviewDashboard(roomReviews, data.today);
  const cardCount = isOwner ? data.owner.reviewsCount : null;
  const apiCount = reviews.count;
  const missing = cardCount !== null ? Math.max(cardCount - apiCount, 0) : 0;

  const roomTitle =
    roomId === OWNER_ROOM_ID
      ? data.owner.title
      : data.rooms.find((r) => r.id === roomId)?.title ?? `اقامتگاه ${roomId}`;

  const rows: ReviewRow[] = roomReviews.map((review) => {
    const dateISO = review.created_at.slice(0, 10);
    return {
      id: review.id,
      dateISO,
      jDisplay: toJalaliLong(dateISO),
      jy: jalaliParts(dateISO).year,
      user: review.user?.name ?? "مهمان",
      rating: typeof review.rating === "number" ? review.rating : 0,
      content: review.content ?? "",
      reply: Boolean(review.host_reply?.content),
      replyTxt: review.host_reply?.content ?? "",
      replyDateISO: review.host_reply?.created_at?.slice(0, 10) ?? "",
    };
  });

  const subRatings = isOwner
    ? SUB_RATING_LABELS.map((item) => ({
        ...item,
        value: data.owner.subRatings[item.key],
      })).filter(
        (item): item is { key: keyof Sub; label: string; value: number } => item.value !== null,
      )
    : [];

  const weakest = [...subRatings].sort((a, b) => a.value - b.value)[0] ?? null;
  const maxBucket = Math.max(...reviews.distribution.map((d) => d.count), 1);
  const ownerHint = isOwner ? "در میان رقبای بابلکنار" : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحلیل نظرات مهمانان"
        description={`${formatNumber(apiCount)} نظر ثبت‌شده برای «${roomTitle}» با میانگین ${formatNumber(
          reviews.averageRating ?? 0,
          2,
        )}.`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-slate-500">اقامتگاه:</span>
        {available.map((id) => {
          const active = id === roomId;
          const label =
            id === OWNER_ROOM_ID
              ? data.owner.title
              : data.rooms.find((r) => r.id === id)?.title ?? `اقامتگاه ${id}`;
          return (
            <Link
              key={id}
              href={`/reviews?room=${id}`}
              className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                active
                  ? "border-brand-400/70 bg-brand-400/20 font-bold text-brand-200"
                  : "border-white/10 bg-white/4 text-slate-400 hover:border-brand-400/40"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <Notice>
        امتیازی که جاجیگا روی آگهی نشان می‌دهد میانگین <strong>۱۲ ماه اخیر</strong> است، در حالی که
        میانگین این صفحه از همه نظرهای دریافت‌شده محاسبه می‌شود؛ پس اختلاف جزئی طبیعی است.
        {cardCount !== null && missing > 0 ? (
          <>
            {" "}
            همچنین کارت آگهی {formatNumber(cardCount)} نظر اعلام می‌کند ولی رابط برنامه‌نویسی{" "}
            {formatNumber(apiCount)} نظر برگرداند؛ {formatNumber(missing)} نظر در دسترس نیست.
          </>
        ) : null}
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="میانگین امتیاز"
          value={formatNumber(reviews.averageRating ?? 0, 2)}
          hint={isOwner ? `صدک ${formatNumber(data.market.ratingPercentile)} ${ownerHint}` : "از همه نظرهای دریافت‌شده"}
          tone="positive"
        />
        <KpiCard
          label="میانگین ۱ سال اخیر"
          value={formatNumber(insights.lastYear?.average ?? 0, 2)}
          hint={`${formatNumber(insights.lastYear?.count ?? 0)} نظر در این بازه — مبنای نمایش سایت`}
          tone={insights.lastYear && insights.lastYear.average !== null ? "default" : "warning"}
        />
        <KpiCard
          label="تعداد نظر"
          value={formatNumber(apiCount)}
          hint={isOwner ? `میانه رقبا ${formatNumber(data.market.medianReviews)} نظر` : `کارت سایت ${cardCount ?? "—"}`}
          tone={isOwner && apiCount < data.market.medianReviews ? "warning" : "default"}
        />
        <KpiCard
          label="نرخ پاسخ‌گویی"
          value={formatPercent(reviews.replyRate)}
          hint="پاسخ میزبان به نظر مهمان"
          tone={reviews.replyRate >= 0.8 ? "positive" : "warning"}
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
          <div className="mt-3 flex flex-wrap gap-4 text-[11.5px] text-slate-500">
            <span>
              امتیاز کامل: <span className="num font-bold text-emerald-300">{formatNumber(insights.fiveStar)}</span>
            </span>
            <span>
              زیر ۵: <span className="num font-bold text-rose-300">{formatNumber(insights.belowFive)}</span>
            </span>
            <span>
              کاربر یکتا: <span className="num font-bold text-slate-200">{formatNumber(insights.uniqueUsers)}</span>
            </span>
            {reviews.count > reviews.ratedCount ? (
              <span>{formatNumber(reviews.count - reviews.ratedCount)} نظر بدون امتیاز عددی ثبت شده است.</span>
            ) : null}
          </div>
        </Card>

        {isOwner ? (
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
        ) : (
          <Card title="کاربران تکرارکننده" subtitle="مهمان‌هایی که بیش از یک بار آمده‌اند — نشانهٔ وفاداری">
            {insights.repeatUsers.length ? (
              <ul className="space-y-2">
                {insights.repeatUsers.map((user) => (
                  <li key={user.name} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-slate-200">{user.name}</span>
                    <span className="text-[11.5px] text-slate-500">
                      <span className="num font-bold text-slate-200">{formatNumber(user.count)}</span> نظر · سال‌ها:{" "}
                      <span className="num">{user.years.join("، ")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-500">هنوز کاربر تکرارکننده‌ای ثبت نشده است.</p>
            )}
          </Card>
        )}
      </div>

      {isOwner && data.reviewTopics.length ? (
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

      <ReviewsDashboard rows={rows} total={apiCount} analysis={insights} />
    </div>
  );
}
