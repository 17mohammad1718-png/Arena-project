import path from "node:path";

import { Card, Chip, DefinitionList, Notice, PageHeader } from "@/components/ui";
import { toJalaliLong } from "@/lib/dates";
import { computeFreshness } from "@/lib/freshness";
import { getDataset } from "@/lib/jajiga/dataset";
import { formatNumber } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "منبع داده" };

/** What each real file in `data/` contributes to the app. */
const FILE_GUIDE: {
  path: string;
  title: string;
  feeds: string;
  caveat?: string;
}[] = [
  {
    path: "data/pricing-dataset.json",
    title: "مشخصات کامل اقامتگاه‌ها",
    feeds: "پروفایل اقامتگاه، نرخ پایه، امکانات، امتیاز، میزبان، انتخاب رقبا و تحلیل بازار",
    caveat: "قیمت‌ها «نرخ هر شب از» هستند؛ قیمت هر شب مشخص در این فایل نیست.",
  },
  {
    path: "data/radar/{id}.json",
    title: "تقویم شبانه رصدشده",
    feeds: "تقویم قیمت، نرخ اشغال، درآمد پیش رو، شاخص قیمت بازار برای هر شب",
    caveat: "فقط شب‌های آینده را پوشش می‌دهد؛ تاریخچه گذشته منتشر نمی‌شود.",
  },
  {
    path: "data/manual-blocks.json",
    title: "شب‌های بسته‌شده دستی",
    feeds: "تفکیک شب رزروشده از شب بسته‌شده",
    caveat: "بدون این فایل، هر شب غیرقابل رزرو اشتباهاً رزرو شمرده می‌شود.",
  },
  {
    path: "data/revenue/*.json",
    title: "درآمد اقامتگاه‌های منطقه",
    feeds: "رتبه‌بندی درآمد، کمیسیون، درآمد خالص",
    caveat: "فقط یک بازه محقق‌شده ثبت شده؛ بقیه فایل‌ها رزروهای آینده‌اند.",
  },
  {
    path: "data/reviews/{id}_reviews.json",
    title: "نظرات مهمانان",
    feeds: "تحلیل نظرات، موضوع‌های تکرارشونده، نرخ پاسخ‌گویی",
    caveat: "تعداد بازگشتی حدود ۱۰٪ کمتر از عدد روی کارت آگهی است.",
  },
  {
    path: "data/top_rooms_sweep.json",
    title: "پویش گسترده استان",
    feeds: "امتیاز جایگزین وقتی امتیاز اقامتگاه خالی است",
  },
];

const FRESHNESS_BADGE = {
  fresh: { label: "تازه", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  aging: { label: "در حال کهنه‌شدن", className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  stale: { label: "کهنه", className: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  unknown: { label: "نامشخص", className: "bg-white/8 text-slate-400 ring-white/15" },
} as const;

export default function DataPage() {
  const data = getDataset();
  const freshness = computeFreshness(path.join(process.cwd(), "data"), data.today);
  const staleGroups = freshness.filter((group) => group.status === "stale");

  return (
    <div className="space-y-6">
      <PageHeader
        title="منبع داده"
        description="همه اعداد این داشبورد از داده واقعی جاجیگا خوانده می‌شوند. این صفحه نشان می‌دهد چه چیزی بارگذاری شده، چه چیزی نشده و چرا."
      />

      {data.isEmpty ? (
        <Notice tone="warning" title="دیتاست بارگذاری نشد">
          اقامتگاه با شناسه ۳۲۹۷۵۸۵ در <code className="font-mono">data/pricing-dataset.json</code>{" "}
          پیدا نشد. مطمئن شوید فایل‌های پوشه <code className="font-mono">data/</code> در جای خود
          هستند.
        </Notice>
      ) : (
        <Notice title="داده واقعی بارگذاری شد">
          هیچ داده نمایشی یا ساختگی در این داشبورد استفاده نمی‌شود. تازه‌سازی داده توسط خط لوله
          جداگانه میزبان انجام می‌شود و این برنامه فقط فایل‌های موجود را می‌خواند.
        </Notice>
      )}

      {staleGroups.length ? (
        <Notice tone="warning" title="بخشی از داده کهنه شده است">
          {staleGroups.map((group) => group.title).join("، ")} از آستانه تازگی گذشته‌اند. برای رفرش،
          راهنمای <code className="font-mono">docs/refresh-runbook.md</code> را دنبال کنید و
          یادتان نرود بعد از رفرش <code className="font-mono">npm run archive</code> بزنید تا
          تاریخچه حفظ شود. طبق قانون داده، خودتان از جاجیگا اسکرپ نکنید — رفرش فقط از طریق
          پایپ‌لاین موجود.
        </Notice>
      ) : null}

      <Card
        title="تازگی داده"
        subtitle="سن هر گروه از خودِ محتوای دیتاست (تاریخ fetch یا نام فایل) خوانده می‌شود، نه صرفاً تاریخ فایل."
      >
        <div className="space-y-2">
          {freshness.map((group) => {
            const badge = FRESHNESS_BADGE[group.status];
            return (
              <div
                key={group.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/4 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-slate-200">{group.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{group.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num text-[11px] text-slate-400">
                    {group.newestDay
                      ? `${toJalaliLong(group.newestDay)} — ${formatNumber(group.ageDays ?? 0)} روز پیش`
                      : "—"}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 rounded-lg bg-white/4 p-3 text-[11px] leading-relaxed text-slate-400">
          آستانه هشدار: رادار و عرضه ۷ روز، درآمد ۱۰ روز، مشخصات ۱۴ روز، نظرات ۳۰ روز. روش رفرش در{" "}
          <code className="font-mono">docs/refresh-runbook.md</code> مستند است.
        </p>
      </Card>

      <Card title="وضعیت بارگذاری">
        <DefinitionList
          items={[
            {
              term: "آخرین به‌روزرسانی تقویم",
              value: data.fetchedAt
                ? `${toJalaliLong(data.fetchedAt.slice(0, 10))}`
                : "ثبت نشده",
            },
            { term: "تاریخ امروز در تحلیل", value: toJalaliLong(data.today) },
            { term: "اقامتگاه‌های بارگذاری‌شده", value: `${formatNumber(data.rooms.length)} مورد` },
            { term: "اقامتگاه‌های دارای تقویم رصد", value: `${formatNumber(data.radarRoomCount)} مورد` },
            { term: "مجموعه مرجع مقایسه", value: `${formatNumber(data.peers.length)} اقامتگاه` },
            { term: "رکوردهای پویش استانی", value: `${formatNumber(data.sweepCount)} ردیف` },
            {
              term: "شب‌های تقویم شما",
              value: data.calendar.length
                ? `${formatNumber(data.calendar.length)} شب — از ${toJalaliLong(
                    data.calendarKpis.rangeStart,
                  )} تا ${toJalaliLong(data.calendarKpis.rangeEnd)}`
                : "تقویمی بارگذاری نشد",
            },
            {
              term: "شب‌های دارای قیمت مرجع بازار",
              value: `${formatNumber(data.marketNights.size)} شب`,
            },
            {
              term: "بازه درآمد محقق‌شده",
              value: data.realizedRange ?? "ثبت نشده",
            },
            {
              term: "نظرات بارگذاری‌شده",
              value: data.reviews ? `${formatNumber(data.reviews.count)} نظر` : "نظری یافت نشد",
            },
          ]}
        />
      </Card>

      <Card
        title="خطاهای بارگذاری"
        subtitle="فایل‌هایی که با ساختار مورد انتظار نخواندند و از تحلیل کنار گذاشته شدند."
      >
        {data.issues.length ? (
          <ul className="space-y-2">
            {data.issues.map((issue, index) => (
              <li
                key={`${issue.file}-${index}`}
                className="rounded-lg bg-rose-500/8 p-3 ring-1 ring-rose-500/20"
              >
                <p className="font-mono text-[11px] text-rose-200">{issue.file}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{issue.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-emerald-500/8 p-3 text-[12px] text-emerald-200 ring-1 ring-emerald-500/20">
            همه فایل‌های دیتاست بدون خطا خوانده شدند.
          </p>
        )}
      </Card>

      <Card title="نقش هر فایل در داشبورد">
        <div className="space-y-3">
          {FILE_GUIDE.map((file) => (
            <div key={file.path} className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-slate-100">{file.title}</span>
                <code className="rounded bg-black/30 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  {file.path}
                </code>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                <span className="text-slate-500">تغذیه می‌کند: </span>
                {file.feeds}
              </p>
              {file.caveat ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300/80">
                  ⚠ {file.caveat}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card title="محدودیت‌هایی که باید بدانید">
        <ul className="space-y-2.5 text-[12px] leading-relaxed text-slate-300">
          {[
            "جاجیگا تاریخچه رزروهای گذشته را منتشر نمی‌کند؛ همه شاخص‌های اشغال و درآمد به شب‌های آینده و یک بازه محقق‌شده محدودند.",
            "امتیاز نمایش‌داده‌شده روی آگهی میانگین ۱۲ ماه اخیر است، نه کل تاریخچه.",
            "غیرقابل رزرو بودن یک شب می‌تواند رزرو یا بستن دستی باشد؛ این برنامه با فایل شب‌های بسته‌شده آن‌ها را تفکیک می‌کند.",
            "تعداد نظرهای دریافتی از رابط برنامه‌نویسی معمولاً کمی کمتر از عدد روی کارت آگهی است.",
            "کمیسیون ۱۲٪ روی مبلغ پس از تخفیف محاسبه می‌شود و درآمد خالص پس از کسر آن است.",
            "تعطیلات تنها شامل تعطیلات ثابت شمسی است و تعطیلات قمری در محاسبه قیمت لحاظ نشده‌اند.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="به‌روزرسانی داده">
        <p className="text-[12px] leading-relaxed text-slate-300">
          داده‌ها به صورت فایل ثابت در پوشه <code className="font-mono">data/</code> نگهداری می‌شوند
          و این برنامه هیچ درخواستی به جاجیگا نمی‌فرستد. برای تازه‌سازی، خط لوله جداگانه میزبان اجرا
          و فایل‌ها جایگزین می‌شوند؛ برنامه در راه‌اندازی بعدی آن‌ها را می‌خواند.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="brand">بدون فراخوانی زنده</Chip>
          <Chip tone="positive">قابل بازتولید</Chip>
          <Chip>راهنمای کامل: docs/DATA-GUIDE.md</Chip>
        </div>
      </Card>
    </div>
  );
}
