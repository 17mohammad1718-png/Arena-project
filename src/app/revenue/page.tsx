import { Card, Chip, KpiCard, Meter, Notice, PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/jajiga/dataset";
import type { RevenueLeaderboardRow } from "@/lib/jajiga/analytics";
import { formatNumber, formatPercent, formatToman, median } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "درآمد منطقه" };

export default function RevenuePage() {
  const data = getDataset();

  if (data.isEmpty || !data.leaderboard.length) {
    return (
      <Notice tone="warning" title="داده درآمد موجود نیست">
        فایل‌های پوشه <code className="font-mono">data/revenue/</code> پیدا نشدند.
      </Notice>
    );
  }

  const realized = data.realizedLeaderboard;
  const board = realized ?? data.leaderboard;
  const owner = board.find((row) => row.isOwn) ?? null;

  const nets = board.map((row) => row.net);
  const medianNet = median(nets);
  const totalNet = nets.reduce((a, b) => a + b, 0);
  const topNet = board[0]?.net ?? 0;

  const adrs = board.filter((row) => row.booked > 0).map((row) => row.adr);
  const medianAdr = median(adrs);
  const totalBooked = board.reduce((a, row) => a + row.booked, 0);

  // The realized snapshot lists only nights that actually sold, so `free` is
  // zero everywhere and would fake a 100٪ occupancy. Derive the real
  // denominator from the window length instead, and only when we know it.
  const windowNights = data.realizedWindowNights;
  const totalCapacity = windowNights ? windowNights * board.length : 0;

  const gapToMedian = owner ? owner.net - medianNet : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="درآمد اقامتگاه‌های منطقه"
        description={
          realized
            ? `درآمد محقق‌شده ${formatNumber(board.length)} اقامتگاه رصدشده در بابلکنار، بازه ${
                data.realizedRange ?? "ثبت‌شده"
              }.`
            : `برآورد درآمد ${formatNumber(board.length)} اقامتگاه رصدشده بر پایه شب‌های رزروشده پیش رو.`
        }
      />

      <Notice tone={realized ? "info" : "warning"}>
        {realized ? (
          <>
            این جدول تنها بازه‌ای است که خط لوله داده، رزروهای <strong>محقق‌شده</strong> را ثبت کرده
            است. جاجیگا تاریخچه کامل رزرو را منتشر نمی‌کند، بنابراین این عدد کل درآمد سالانه نیست.
            کمیسیون ۱۲٪ از مبلغ پس از تخفیف کسر شده است.
          </>
        ) : (
          <>
            بازه محقق‌شده در دسترس نیست؛ ارقام زیر بر پایه <strong>رزروهای ثبت‌شده برای آینده</strong>{" "}
            هستند و با گذشت زمان تغییر می‌کنند.
          </>
        )}
      </Notice>

      {/* --------------------------------- KPIs --------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="درآمد خالص شما"
          value={owner ? formatToman(owner.net) : "—"}
          hint={owner ? `${formatNumber(owner.booked)} شب رزروشده` : "اقامتگاه شما در این بازه نیست"}
          tone="brand"
        />
        <KpiCard
          label="رتبه شما"
          value={owner ? `${formatNumber(owner.rank)} از ${formatNumber(board.length)}` : "—"}
          hint={
            owner
              ? `صدک ${formatNumber(
                  Math.round(((board.length - owner.rank) / Math.max(board.length - 1, 1)) * 100),
                )}`
              : "—"
          }
          tone={owner && owner.rank <= board.length / 3 ? "positive" : "warning"}
        />
        <KpiCard
          label="اختلاف با میانه منطقه"
          value={`${gapToMedian >= 0 ? "+" : "−"}${formatToman(Math.abs(gapToMedian))}`}
          hint={`میانه خالص ${formatToman(medianNet)}`}
          tone={gapToMedian >= 0 ? "positive" : "warning"}
        />
        <KpiCard
          label="میانگین نرخ شبانه شما"
          value={owner && owner.booked > 0 ? formatToman(owner.adr) : "—"}
          hint={`میانه منطقه ${formatToman(medianAdr)}`}
        />
      </div>

      <Card title="تصویر کلی بازار در این بازه">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="مجموع درآمد خالص منطقه" value={formatToman(totalNet)} />
          <Stat
            label="مجموع شب‌های فروخته‌شده"
            value={`${formatNumber(totalBooked)} شب`}
            hint={
              totalCapacity
                ? `از ${formatNumber(totalCapacity)} شب ممکن — اشغال ${formatPercent(
                    totalBooked / totalCapacity,
                  )}`
                : `میانگین ${formatNumber(totalBooked / board.length, 1)} شب برای هر اقامتگاه`
            }
          />
          <Stat label="بیشترین درآمد یک اقامتگاه" value={formatToman(topNet)} />
          <Stat
            label="سهم شما از کل منطقه"
            value={owner && totalNet ? formatPercent(owner.net / totalNet) : "—"}
            hint={`اگر همه برابر بودند: ${formatPercent(1 / board.length)}`}
          />
        </div>
      </Card>

      {/* ------------------------------ Leaderboard ------------------------------ */}
      <Card
        title="رتبه‌بندی درآمد خالص"
        subtitle="ردیف فیروزه‌ای اقامتگاه شماست. طول میله نسبت به پردرآمدترین اقامتگاه است."
      >
        <LeaderboardTable rows={board} topNet={topNet} />
      </Card>

      {/* ---------------------- Forward projection comparison -------------------- */}
      {realized && data.leaderboard.length ? (
        <Card
          title="رزروهای ثبت‌شده برای آینده"
          subtitle="این ارقام هنوز محقق نشده‌اند و ممکن است تغییر کنند."
        >
          <LeaderboardTable
            rows={data.leaderboard.slice(0, 12)}
            topNet={data.leaderboard[0]?.net ?? 0}
          />
        </Card>
      ) : null}

      <Card title="چه چیزی درآمد را در این منطقه بالا می‌برد؟">
        <TopEarnerAnalysis rows={board} />
      </Card>
    </div>
  );
}

function LeaderboardTable({ rows, topNet }: { rows: RevenueLeaderboardRow[]; topNet: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-right">
        <thead>
          <tr className="border-b border-white/8 text-[11px] text-slate-500">
            <th className="w-10 py-2 font-semibold">#</th>
            <th className="py-2 font-semibold">اقامتگاه</th>
            <th className="py-2 font-semibold">شب رزرو</th>
            <th className="py-2 font-semibold">نرخ شبانه</th>
            <th className="py-2 font-semibold">ناخالص</th>
            <th className="py-2 font-semibold">کمیسیون</th>
            <th className="py-2 font-semibold">خالص</th>
            <th className="w-32 py-2 font-semibold">نسبت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.id}-${row.rank}`}
              className={`border-b border-white/5 text-[12px] last:border-0 ${
                row.isOwn ? "bg-brand-500/8" : "hover:bg-white/3"
              }`}
            >
              <td className="num py-2.5 font-bold text-slate-500">{formatNumber(row.rank)}</td>
              <td className="py-2.5">
                <div className="flex max-w-[300px] items-center gap-2">
                  <span
                    className={`truncate ${
                      row.isOwn ? "font-bold text-brand-200" : "text-slate-200"
                    }`}
                    title={row.title}
                  >
                    {row.title}
                  </span>
                  {row.isOwn ? <Chip tone="brand">شما</Chip> : null}
                </div>
                <span className="text-[10px] text-slate-500">{row.village}</span>
              </td>
              <td className="num py-2.5 text-slate-300">{formatNumber(row.booked)}</td>
              <td className="num py-2.5 text-slate-400">
                {row.booked > 0 ? formatToman(row.adr) : "—"}
              </td>
              <td className="num py-2.5 text-slate-400">{formatToman(row.grossDiscounted)}</td>
              <td className="num py-2.5 text-rose-300/80">{formatToman(row.commission)}</td>
              <td
                className={`num py-2.5 font-bold ${
                  row.isOwn ? "text-brand-200" : "text-emerald-300"
                }`}
              >
                {formatToman(row.net)}
              </td>
              <td className="py-2.5 pl-2">
                <Meter
                  value={topNet ? row.net / topNet : 0}
                  tone={row.isOwn ? "brand" : "positive"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Split the board into top and bottom thirds and contrast nights sold against
 * nightly rate. It answers the host's real question: do the leaders charge
 * more, or simply sell more nights?
 */
function TopEarnerAnalysis({ rows }: { rows: RevenueLeaderboardRow[] }) {
  const size = Math.max(Math.floor(rows.length / 3), 1);
  const top = rows.slice(0, size);
  const bottom = rows.slice(-size);

  const avg = (list: RevenueLeaderboardRow[], pick: (r: RevenueLeaderboardRow) => number) =>
    list.length ? list.reduce((a, r) => a + pick(r), 0) / list.length : 0;

  const topNights = avg(top, (r) => r.booked);
  const bottomNights = avg(bottom, (r) => r.booked);
  const topAdr = avg(
    top.filter((r) => r.booked > 0),
    (r) => r.adr,
  );
  const bottomAdr = avg(
    bottom.filter((r) => r.booked > 0),
    (r) => r.adr,
  );

  const nightsRatio = bottomNights ? topNights / bottomNights : 0;
  const adrRatio = bottomAdr ? topAdr / bottomAdr : 0;

  const driver =
    nightsRatio >= adrRatio * 1.3
      ? "تعداد شب فروخته‌شده"
      : adrRatio >= nightsRatio * 1.3
        ? "نرخ شبانه بالاتر"
        : "ترکیبی از نرخ و تعداد شب";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-500/8 p-3.5 ring-1 ring-emerald-500/20">
          <p className="text-[11px] font-bold text-emerald-300">
            یک‌سوم بالای جدول ({formatNumber(top.length)} اقامتگاه)
          </p>
          <div className="mt-2 space-y-1 text-[12px] text-slate-300">
            <Row label="میانگین شب فروخته‌شده" value={formatNumber(topNights, 1)} />
            <Row label="میانگین نرخ شبانه" value={formatToman(topAdr)} />
            <Row label="میانگین درآمد خالص" value={formatToman(avg(top, (r) => r.net))} />
          </div>
        </div>

        <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/8">
          <p className="text-[11px] font-bold text-slate-400">
            یک‌سوم پایین جدول ({formatNumber(bottom.length)} اقامتگاه)
          </p>
          <div className="mt-2 space-y-1 text-[12px] text-slate-300">
            <Row label="میانگین شب فروخته‌شده" value={formatNumber(bottomNights, 1)} />
            <Row label="میانگین نرخ شبانه" value={bottomAdr ? formatToman(bottomAdr) : "—"} />
            <Row label="میانگین درآمد خالص" value={formatToman(avg(bottom, (r) => r.net))} />
          </div>
        </div>
      </div>

      <p className="rounded-lg bg-white/4 p-3 text-[12px] leading-relaxed text-slate-300 ring-1 ring-white/6">
        عامل اصلی اختلاف در این بازه <strong className="text-white">{driver}</strong> بوده است.
        {nightsRatio >= adrRatio * 1.3 ? (
          <>
            {" "}اقامتگاه‌های بالای جدول حدود {formatNumber(nightsRatio, 1)} برابر بیشتر شب
            فروخته‌اند، در حالی که نرخ شبانه‌شان تنها {formatNumber(adrRatio, 1)} برابر است. یعنی
            کلید رشد، پر کردن تقویم است نه گران‌تر کردن نرخ.
          </>
        ) : adrRatio >= nightsRatio * 1.3 ? (
          <>
            {" "}اقامتگاه‌های بالای جدول نرخ شبانه‌ای حدود {formatNumber(adrRatio, 1)} برابر دارند.
            معمولاً امکاناتی مثل استخر یا جکوزی این اختلاف را توجیه می‌کند.
          </>
        ) : (
          <>
            {" "}هم نرخ و هم تعداد شب در بالای جدول بالاتر است؛ بهبود باید هم‌زمان روی جذابیت آگهی و
            هم روی قیمت‌گذاری انجام شود.
          </>
        )}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="num font-bold text-slate-100">{value}</span>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/4 p-3.5 ring-1 ring-white/6">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="num mt-1 text-[15px] font-extrabold text-white">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
