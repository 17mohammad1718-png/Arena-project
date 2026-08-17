import { Card, EmptyState, KpiCard, Notice, PageHeader } from "@/components/ui";
import { CustomersMonthlyChart } from "@/components/customers-chart";
import { getDb } from "@/lib/db";
import {
  aggregateByMonth,
  aggregateChannels,
  aggregateCustomers,
  summarizeHistory,
  type BookingHistoryRow,
} from "@/lib/customers";
import { jalaliMonthKey, toJalali, toJalaliMonthShort } from "@/lib/dates";
import { formatNumber, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "مشتریان" };

interface DbRow {
  id: number;
  customer_name: string;
  channel: string;
  net_amount: number;
  gross_amount: number;
  commission: number;
  check_in: string;
  nights: number;
  guests: number | null;
  is_hourly: number;
  customer_city: string;
  notes: string;
}

function loadBookings(): BookingHistoryRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM bookings_history ORDER BY check_in DESC, id DESC")
    .all() as DbRow[];
  return rows.map((r) => ({
    id: r.id,
    customerName: r.customer_name,
    channel: r.channel,
    netAmount: r.net_amount,
    grossAmount: r.gross_amount,
    commission: r.commission,
    checkIn: r.check_in,
    nights: r.nights,
    guests: r.guests,
    isHourly: r.is_hourly === 1,
    customerCity: r.customer_city,
    notes: r.notes,
  }));
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function CustomersPage() {
  const bookings = loadBookings();

  if (!bookings.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="مشتریان" description="تاریخچه رزرو واقعی و تحلیل مشتری" />
        <EmptyState
          title="هنوز رزروی وارد نشده"
          description="ابتدا npm run sync و سپس npm run import:bookings را اجرا کنید."
        />
      </div>
    );
  }

  const summary = summarizeHistory(bookings);
  const customers = aggregateCustomers(bookings);
  const channels = aggregateChannels(bookings);
  const months = aggregateByMonth(bookings, jalaliMonthKey);
  const repeats = customers.filter((c) => c.visits >= 2);

  const chartData = months.map((m) => ({
    label: toJalaliMonthShort(m.monthKey + "-01"),
    net: m.net,
    count: m.count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="مشتریان"
        description="تاریخچه رزرو واقعی از داشبورد کلبه — همه کانال‌ها، فروردین تا شهریور ۱۴۰۵"
      />

      <Notice>
        این داده از خروجی داشبورد کلبه (chalet-bookings-latest.json) وارد شده و شامل تمام
        رزروهای واقعی شماست. برای به‌روزرسانی: npm run sync && npm run import:bookings
      </Notice>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="کل دریافتی خالص"
          value={formatToman(summary.totalNet)}
          hint={`${formatNumber(summary.totalBookings)} رزرو · ${formatNumber(summary.totalNights)} شب`}
          tone="brand"
        />
        <KpiCard
          label="مشتری یکتا"
          value={formatNumber(summary.uniqueCustomers)}
          hint={summary.repeatCustomers ? `${formatNumber(summary.repeatCustomers)} برگشتی` : "بدون برگشتی"}
        />
        <KpiCard
          label="ADR خالص"
          value={formatToman(summary.adrNet)}
          hint="درآمد خالص هر شب فروخته‌شده"
        />
        <KpiCard
          label="میانگین هر رزرو"
          value={formatToman(summary.avgNetPerBooking)}
          hint={summary.hourlyCount ? `${formatNumber(summary.hourlyCount)} رزرو ساعتی` : undefined}
        />
      </div>

      {/* Monthly revenue chart */}
      <Card title="درآمد ماهانه" subtitle="جمع دریافتی خالص هر ماه شمسی">
        <CustomersMonthlyChart data={chartData} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Channel analysis */}
        <Card title="تحلیل کانال / معرف" subtitle="سهم هر کانال از درآمد خالص">
          <div className="space-y-3">
            {channels.map((ch) => (
              <div key={ch.channel}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-slate-300">
                    {ch.channel}
                    {ch.rate > 0 && (
                      <span className="mr-1.5 text-[10px] text-slate-500">
                        کارمزد {Math.round(ch.rate * 100)}٪
                      </span>
                    )}
                  </span>
                  <span className="num text-slate-200">
                    {formatToman(ch.net)}
                    <span className="mr-1.5 text-[10px] text-slate-500">
                      {formatNumber(ch.count)} رزرو
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/6">
                  <div
                    className="h-full rounded-full bg-brand-400/70"
                    style={{ width: `${Math.max(ch.share * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Repeat customers */}
        <Card
          title="مشتریان برگشتی"
          subtitle={repeats.length ? "دو بار یا بیشتر اقامت داشته‌اند" : "هنوز مشتری برگشتی ندارید"}
        >
          {repeats.length ? (
            <div className="space-y-2">
              {repeats.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2"
                >
                  <div>
                    <p className="text-[13px] font-medium text-slate-200">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.city || "—"} · آخرین: {toJalali(c.lastCheckIn)}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="num text-[13px] font-bold text-brand-300">
                      {formatNumber(c.visits)} بار
                    </p>
                    <p className="num text-[11px] text-slate-400">{formatToman(c.net)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              با ثبت رزروهای بیشتر، مشتریان برگشتی اینجا ظاهر می‌شوند.
            </p>
          )}
        </Card>
      </div>

      {/* Customer table */}
      <Card
        title="جدول مشتریان"
        subtitle={`${formatNumber(customers.length)} مشتری · مرتب‌شده بر اساس کل دریافتی`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/8 text-right text-[11px] text-slate-500">
                <th className="pb-2 pl-3 font-medium">#</th>
                <th className="pb-2 pl-3 font-medium">نام</th>
                <th className="pb-2 pl-3 font-medium">مراجعه</th>
                <th className="pb-2 pl-3 font-medium">شب</th>
                <th className="pb-2 pl-3 font-medium">خالص</th>
                <th className="pb-2 pl-3 font-medium">میانگین</th>
                <th className="pb-2 pl-3 font-medium">آخرین</th>
                <th className="pb-2 font-medium">شهر</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.name} className="border-b border-white/4 hover:bg-white/3">
                  <td className="num py-2 pl-3 text-slate-400">
                    {i < 3 ? MEDALS[i] : formatNumber(i + 1)}
                  </td>
                  <td className="py-2 pl-3 font-medium text-slate-200">{c.name}</td>
                  <td className="num py-2 pl-3">{formatNumber(c.visits)}</td>
                  <td className="num py-2 pl-3">{formatNumber(c.nights)}</td>
                  <td className="num py-2 pl-3 text-brand-300">{formatToman(c.net)}</td>
                  <td className="num py-2 pl-3">{formatToman(c.avgNet)}</td>
                  <td className="num py-2 pl-3 text-slate-400">{toJalali(c.lastCheckIn)}</td>
                  <td className="py-2 text-slate-400">{c.city || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
