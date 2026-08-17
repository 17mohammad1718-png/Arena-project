import { Card, Chip, DefinitionList, Notice, PageHeader } from "@/components/ui";
import { toJalaliLong } from "@/lib/dates";
import { loadDataset } from "@/lib/load-dataset";
import { formatNumber } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "منبع داده" };

/** The exact columns each importable file understands. */
const SCHEMA_GUIDE: {
  file: string;
  title: string;
  required: string[];
  optional: string[];
}[] = [
  {
    file: "property.csv",
    title: "مشخصات اقامتگاه",
    required: ["title", "capacity", "basePrice"],
    optional: [
      "id",
      "listingCode",
      "url",
      "area",
      "city",
      "province",
      "propertyType",
      "bedrooms",
      "extraCapacity",
      "builtAreaM2",
      "landAreaM2",
      "amenities",
      "weekendPrice",
      "extraGuestFee",
      "rating",
      "reviewsCount",
    ],
  },
  {
    file: "reservations.csv",
    title: "رزروها",
    required: ["checkIn", "checkOut یا nights", "grossAmount"],
    optional: ["id", "guests", "status", "platformFee", "discount", "refund", "note"],
  },
  {
    file: "blocked.csv",
    title: "شب‌های مسدود",
    required: ["date"],
    optional: ["reason", "note"],
  },
  {
    file: "expenses.csv",
    title: "هزینه‌ها",
    required: ["date", "amount"],
    optional: ["id", "category", "note"],
  },
  {
    file: "prices.csv",
    title: "قیمت روزانه",
    required: ["date", "price"],
    optional: ["available"],
  },
  {
    file: "views.csv",
    title: "بازدیدها",
    required: ["date", "views"],
    optional: ["inquiries"],
  },
  {
    file: "competitors.csv",
    title: "رقبا",
    required: ["title", "weekdayPrice"],
    optional: [
      "id",
      "url",
      "area",
      "distanceKm",
      "propertyType",
      "capacity",
      "bedrooms",
      "builtAreaM2",
      "weekendPrice",
      "rating",
      "reviewsCount",
      "amenities",
      "unavailableShare",
    ],
  },
];

export default function DataPage() {
  const dataset = loadDataset();
  const realCount = dataset.reports.filter((r) => r.origin === "real").length;
  const allIssues = dataset.reports.flatMap((r) =>
    r.issues.map((issue) => ({ label: r.label, issue })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="منبع داده و وضعیت بارگذاری"
        description={`${formatNumber(realCount)} از ${formatNumber(
          dataset.reports.length,
        )} بخش از داده واقعی خوانده شده است. بقیه فعلاً روی داده نمایشی است.`}
      />

      {dataset.origin === "demo" ? (
        <Notice tone="warning" title="هنوز هیچ فایل واقعی خوانده نشده است">
          پوشه{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">data/</code> در
          ریشه پروژه را بسازید و فایل‌های خود را در آن بگذارید. برنامه به‌صورت خودکار آنها را
          تشخیص می‌دهد و نیازی به تغییر کد نیست.
        </Notice>
      ) : dataset.origin === "mixed" ? (
        <Notice title="داده ترکیبی">
          بخشی از داده‌ها واقعی و بخشی نمایشی است. تا زمانی که همه بخش‌ها واقعی نشوند، اعداد ترکیبی
          را با احتیاط تفسیر کنید.
        </Notice>
      ) : (
        <Notice title="همه بخش‌ها از داده واقعی خوانده شده‌اند">
          تحلیل‌های این داشبورد اکنون کاملاً بر پایه دیتاست شماست.
        </Notice>
      )}

      {/* ------------------------------- Status ------------------------------- */}
      <Card title="وضعیت هر بخش">
        <div className="overflow-x-auto">
          <table className="w-full min-w-2xl text-right">
            <thead>
              <tr className="border-b border-white/8">
                <th className="px-3 py-2 text-[11px] font-bold text-slate-400">بخش</th>
                <th className="px-3 py-2 text-[11px] font-bold text-slate-400">منبع</th>
                <th className="px-3 py-2 text-[11px] font-bold text-slate-400">فایل</th>
                <th className="px-3 py-2 text-[11px] font-bold text-slate-400">تعداد رکورد</th>
              </tr>
            </thead>
            <tbody>
              {dataset.reports.map((report) => (
                <tr key={report.key} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2.5 text-[12px] font-semibold text-slate-100">
                    {report.label}
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip tone={report.origin === "real" ? "positive" : "warning"}>
                      {report.origin === "real" ? "داده واقعی" : "داده نمایشی"}
                    </Chip>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400" dir="ltr">
                    {report.file ?? "—"}
                  </td>
                  <td className="num px-3 py-2.5 text-[12px] text-slate-300">
                    {formatNumber(report.recordCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {allIssues.length ? (
        <Card title="هشدارهای اعتبارسنجی" subtitle="ردیف‌هایی که خوانده نشدند یا مقدار نامعتبر داشتند.">
          <ul className="space-y-1.5">
            {allIssues.slice(0, 20).map((item, index) => (
              <li
                key={`${item.label}-${index}`}
                className="rounded-lg bg-rose-500/8 px-3 py-2 text-[11px] text-rose-100 ring-1 ring-rose-500/15"
              >
                <span className="font-bold">{item.label}</span> — {item.issue}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="بازه و حجم داده فعلی">
        <DefinitionList
          items={[
            { term: "شروع بازه", value: toJalaliLong(dataset.range.start) },
            { term: "پایان بازه", value: toJalaliLong(dataset.range.end) },
            { term: "تعداد رزرو", value: formatNumber(dataset.reservations.length) },
            { term: "شب‌های مسدود", value: formatNumber(dataset.blockedNights.length) },
            { term: "رکورد هزینه", value: formatNumber(dataset.expenses.length) },
            { term: "رکورد قیمت روزانه", value: formatNumber(dataset.dailyPrices.length) },
            { term: "رکورد بازدید", value: formatNumber(dataset.views.length) },
            { term: "تعداد رقیب", value: formatNumber(dataset.competitors.length) },
          ]}
        />
      </Card>

      {/* ------------------------------- Schema -------------------------------- */}
      <Card
        title="ساختار فایل‌های قابل بارگذاری"
        subtitle="هر فایل مستقل است؛ می‌توانید فقط بخشی از آنها را بگذارید. فرمت CSV و JSON هر دو پشتیبانی می‌شود."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {SCHEMA_GUIDE.map((schema) => (
            <div key={schema.file} className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="text-[12px] font-bold text-slate-100">{schema.title}</h4>
                <code className="font-mono text-[10px] text-brand-300" dir="ltr">
                  data/{schema.file}
                </code>
              </div>
              <p className="mb-1.5 text-[10px] font-bold text-slate-400">ستون‌های ضروری</p>
              <div className="mb-2.5 flex flex-wrap gap-1">
                {schema.required.map((column) => (
                  <code
                    key={column}
                    dir="ltr"
                    className="rounded bg-emerald-500/12 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
                  >
                    {column}
                  </code>
                ))}
              </div>
              <p className="mb-1.5 text-[10px] font-bold text-slate-400">ستون‌های اختیاری</p>
              <div className="flex flex-wrap gap-1">
                {schema.optional.map((column) => (
                  <code
                    key={column}
                    dir="ltr"
                    className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                  >
                    {column}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="نکات مهم بارگذاری">
        <ul className="space-y-2.5 text-[12px] leading-relaxed text-slate-300">
          <li className="flex gap-2">
            <span className="text-brand-400">•</span>
            <span>
              تاریخ‌ها می‌توانند شمسی (<code dir="ltr" className="font-mono text-[11px]">1404/05/26</code>) یا
              میلادی (<code dir="ltr" className="font-mono text-[11px]">2025-08-17</code>) باشند؛ ارقام فارسی هم
              پذیرفته می‌شود.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-400">•</span>
            <span>
              مبالغ به تومان و بدون واحد وارد شوند. جداکننده هزارگان و کلمه «تومان» به‌صورت خودکار
              حذف می‌شود.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-400">•</span>
            <span>
              نام ستون‌ها می‌تواند فارسی باشد؛ مثلاً «تاریخ ورود»، «مبلغ کل»، «امکانات». تطبیق نام
              ستون‌ها فازی است و به فاصله و خط تیره حساس نیست.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-400">•</span>
            <span>
              فهرست‌ها (مثل امکانات) را با ویرگول، خط عمودی یا نقطه‌ویرگول جدا کنید.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-400">•</span>
            <span>
              پوشه <code dir="ltr" className="font-mono text-[11px]">data/</code> در گیت نادیده گرفته می‌شود تا
              اطلاعات مالی و رزرو خصوصی شما وارد مخزن نشود.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
