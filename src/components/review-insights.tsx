/**
 * Presentational review analytics: Jalali timeline, keyword bars, unique-style
 * theme cards with proof quotes, and fun/notable comments. Pure JSX — safe to
 * import from server or client; interaction (theme → table jump) is forwarded
 * through `onWord`.
 */
import { Card, Chip } from "./ui";
import type {
  FunComment,
  ReviewDashboardAnalytics,
  ReviewKeyword,
  ReviewTheme,
  ReviewTimelinePoint,
} from "@/lib/jajiga/reviewAnalytics";
import { formatNumber } from "@/lib/metrics";

const THEME_ICONS: Record<string, string> = {
  gen: "🔌",
  pool: "🏊",
  view: "🏔️",
  garden: "🍊",
  cats: "🐈",
  host: "🤝",
  hotel: "🛏️",
  loyal: "💛",
  road: "🛣️",
};

const FUN_TAG_CLASS: Record<string, string> = {
  بامزه: "bg-lime-500/10 text-lime-300 ring-lime-400/30",
  انتقادی: "bg-rose-500/10 text-rose-300 ring-rose-400/30",
  احساسی: "bg-amber-500/10 text-amber-300 ring-amber-400/30",
  مفصل: "bg-sky-500/10 text-sky-300 ring-sky-400/30",
};

const MUTED_EMPTY =
  "داده کافی نیست — با نظرهای بیشتر این بخش دقیق‌تر می‌شود.";

/* -------------------------------- timeline -------------------------------- */

function TimelineBars({ points }: { points: ReviewTimelinePoint[] }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-end gap-1">
        {points.map((p) => {
          const height = Math.max(3, Math.round((p.count / max) * 120));
          const peak = p.count === max;
          return (
            <div
              key={p.key}
              className="flex w-[38px] flex-col items-center justify-end"
              title={`${p.label} — ${p.count} نظر · میانگین ${formatNumber(p.average, 2)}`}
            >
              <div
                className={`w-[22px] rounded-t-md ${
                  peak
                    ? "bg-gradient-to-b from-amber-400 to-amber-600"
                    : "bg-gradient-to-b from-sky-400 to-sky-700"
                }`}
                style={{ height: `${height}px` }}
              />
              <div className="mt-1.5 origin-top -rotate-45 whitespace-nowrap text-[9px] text-slate-500">
                {p.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- keywords -------------------------------- */

function KeywordRows({ keywords }: { keywords: ReviewKeyword[] }) {
  if (!keywords.length) return <p className="text-[12px] text-slate-500">{MUTED_EMPTY}</p>;
  const max = keywords[0].count;
  return (
    <div className="space-y-2">
      {keywords.map((k) => (
        <div key={k.word} className="flex items-center gap-2.5">
          <span className="w-28 truncate text-right text-[12.5px] text-slate-200">{k.word}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full bg-gradient-to-l from-teal-600 to-teal-400"
              style={{ width: `${Math.max(4, Math.round((k.count / max) * 100))}%` }}
            />
          </div>
          <span className="num w-8 shrink-0 text-left text-[12px] font-bold text-teal-300">
            {formatNumber(k.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- themes -------------------------------- */

function ThemeCards({ themes, onWord }: { themes: ReviewTheme[]; onWord: (word: string) => void }) {
  if (!themes.length) return <p className="text-[12px] text-slate-500">{MUTED_EMPTY}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {themes.map((theme) => (
        <div key={theme.key} className="card flex flex-col gap-2.5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px]">{THEME_ICONS[theme.key] ?? "✨"}</span>
            <h3 className="text-[13.5px] font-bold text-white">{theme.title}</h3>
            <Chip tone="positive">
              <span className="num">{theme.count}</span> نظر
            </Chip>
          </div>
          <p className="text-[11.5px] text-slate-400">{theme.desc}</p>
          {theme.samples.map((sample, index) => (
            <blockquote
              key={index}
              className="rounded-lg border-r-2 border-teal-600/60 bg-white/3 px-2.5 py-1.5 text-[12px] leading-relaxed text-slate-300"
            >
              {sample.text}
              <footer className="mt-1 text-[10.5px] text-slate-500">
                — {sample.name ?? "مهمان"} · <span className="num" dir="ltr">{sample.date}</span> ·{" "}
                <span className="num">{sample.rating == null ? "-" : formatNumber(sample.rating, 1)}</span> ★
              </footer>
            </blockquote>
          ))}
          <button
            onClick={() => onWord(theme.word)}
            className="mt-auto self-start text-[12px] font-semibold text-brand-300 hover:text-brand-200"
          >
            مشاهده همه در جدول ↓
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- fun ----------------------------------- */

function FunGrid({ fun }: { fun: FunComment[] }) {
  if (!fun.length) return <p className="text-[12px] text-slate-500">{MUTED_EMPTY}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fun.map((item, index) => (
        <div key={index} className="card flex flex-col gap-2 p-4">
          <span
            className={`self-start rounded-full px-2.5 py-0.5 text-[11px] ring-1 ${FUN_TAG_CLASS[item.tag] ?? FUN_TAG_CLASS["احساسی"]}`}
          >
            {item.tag}
          </span>
          <p className="text-[13px] italic leading-relaxed text-slate-200">«{item.text}»</p>
          <p className="text-[11px] text-slate-500">
            {item.name ?? "مهمان"} · <span className="num" dir="ltr">{item.date}</span> ·{" "}
            <span className="num">{item.rating == null ? "-" : formatNumber(item.rating, 1)}</span> ★
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- main ---------------------------------- */

export function ReviewInsights({
  analysis,
  onWord,
}: {
  analysis: ReviewDashboardAnalytics;
  onWord: (word: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Card title="روند ماهانه نظرات" subtitle="تعداد نظر با امتیاز ثبت‌شده در هر ماه شمسی — ستون طلایی: پرتکرارترین ماه">
        <TimelineBars points={analysis.timeline} />
      </Card>

      <Card title="کلیدواژه‌های پرتکرار" subtitle="واژه‌های پرتکرار از متن نظرها (بدون واژه‌های بی‌معنی)">
        <KeywordRows keywords={analysis.keywords} />
      </Card>

      <Card title="سبک منحصر به فرد اقامتگاه" subtitle="با پیام مهمان‌ها — هر کارت یک ویژگیِ اثبات‌شده است">
        <ThemeCards themes={analysis.themes} onWord={onWord} />
      </Card>

      <Card title="کامنت‌های جالب و نکته‌ها" subtitle="انتخاب خودکار با پخش‌شدگی دسته‌ها (حداکثر ۲ از هر دسته)">
        <FunGrid fun={analysis.fun} />
      </Card>
    </div>
  );
}
