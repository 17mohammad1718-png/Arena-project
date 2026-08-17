import { Suspense } from "react";

import { ExpenseForm, ExpenseList, RecurringManager } from "@/components/finance-forms";
import { ImportWizard } from "@/components/import-wizard";
import { MonthNav } from "@/components/month-nav";
import { Card, KpiCard, Notice, PageHeader } from "@/components/ui";
import {
  addDays,
  jalaliMonthEnd,
  jalaliMonthStart,
  jalaliParts,
  toJalaliMonthLabel,
} from "@/lib/dates";
import { getDb } from "@/lib/db";
import {
  applyRecurrings,
  listExpenses,
  listRecurrings,
  reservationsInRange,
} from "@/lib/db/repo";
import { computeProfit, mergeRevenueNights } from "@/lib/finance";
import { getDataset } from "@/lib/jajiga/dataset";
import { formatNumber, formatPercent, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "مالی من" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const data = getDataset();
  const db = getDb();

  const current = jalaliParts(data.today);
  const year = Number(params.year) || current.year;
  const month = Math.min(Math.max(Number(params.month) || current.month, 1), 12);

  const from = jalaliMonthStart(year, month);
  const to = jalaliMonthEnd(year, month);

  // Materialize recurring costs for the viewed month (idempotent).
  const monthDates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) monthDates.push(d);
  applyRecurrings(db, monthDates);

  const expenses = listExpenses(db, from, to);
  const recurrings = listRecurrings(db);
  const reservations = reservationsInRange(db, from, to);

  const revenueNights = mergeRevenueNights(data.calendar, reservations, from, to);
  const profit = computeProfit(revenueNights, expenses);

  const monthLabel = toJalaliMonthLabel(from);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مالی من"
        description="سود واقعی ماه: درآمد منهای کمیسیون جاجیگا و هزینه‌های عملیاتی ثبت‌شده."
        action={
          <Suspense fallback={null}>
            <MonthNav year={year} month={month} />
          </Suspense>
        }
      />

      <Notice>
        درآمد این صفحه از تقویم واقعی رزرو (رادار) و رزروهای ثبت‌شده دستی ساخته می‌شود؛ رزرو دستی بر
        استنباط رادار مقدم است. هزینه‌ها فقط همان‌هایی هستند که خودتان ثبت کرده‌اید — پس «سود واقعی»
        به‌اندازه کامل‌بودن هزینه‌های ثبت‌شده دقیق است.
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={`درآمد ناخالص ${monthLabel}`}
          value={formatToman(profit.grossRevenue)}
          hint={`${formatNumber(profit.soldNights)} شب فروخته‌شده${
            profit.manualNights ? ` · ${formatNumber(profit.manualNights)} شب ثبت دستی` : ""
          }`}
        />
        <KpiCard
          label="کمیسیون جاجیگا (۱۶٪)"
          value={formatToman(profit.commission)}
          hint={`درآمد خالص ${formatToman(profit.netRevenue)}`}
        />
        <KpiCard
          label="هزینه‌های ثبت‌شده"
          value={formatToman(profit.totalExpenses)}
          hint={
            profit.expenseToRevenue !== null
              ? `${formatPercent(profit.expenseToRevenue)} از درآمد`
              : "درآمدی در این ماه ثبت نشده"
          }
          tone={profit.expenseToRevenue !== null && profit.expenseToRevenue > 0.35 ? "warning" : "default"}
        />
        <KpiCard
          label="سود واقعی ماه"
          value={formatToman(profit.realProfit)}
          hint={
            profit.profitPerSoldNight !== null
              ? `${formatToman(profit.profitPerSoldNight)} سود هر شب`
              : "—"
          }
          tone={profit.realProfit >= 0 ? "positive" : "warning"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card title="ثبت هزینه جدید" subtitle="تاریخ شمسی، مبلغ به تومان">
          <ExpenseForm defaultDate={data.today} />
        </Card>

        <Card
          title="هزینه به تفکیک دسته"
          subtitle={profit.byCategory.length ? `${monthLabel}` : "هنوز هزینه‌ای ثبت نشده"}
        >
          {profit.byCategory.length ? (
            <ul className="space-y-2.5">
              {profit.byCategory.map((entry) => (
                <li key={entry.category}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="text-slate-300">{entry.label}</span>
                    <span className="num text-slate-200">
                      {formatToman(entry.amount)}
                      <span className="mr-1.5 text-[10px] text-slate-500">
                        {formatPercent(entry.share)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
                    <div
                      className="h-full rounded-full bg-brand-400/70"
                      style={{ width: `${Math.max(entry.share * 100, 2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[12px] text-slate-500">
              با ثبت اولین هزینه، تفکیک دسته‌ها اینجا ظاهر می‌شود.
            </p>
          )}
        </Card>
      </div>

      <Card title={`هزینه‌های ${monthLabel}`} subtitle={`${formatNumber(expenses.length)} مورد`}>
        <ExpenseList expenses={expenses} />
      </Card>

      <Card
        title="هزینه‌های تکرارشونده ماهانه"
        subtitle="هر ماه خودکار در همان روز ثبت می‌شوند؛ با غیرفعال‌کردن، از ماه‌های بعد ثبت نمی‌شوند."
      >
        <RecurringManager recurrings={recurrings} />
      </Card>

      <Card
        title="ایمپورت از فایل CSV"
        subtitle="رزروها، هزینه‌ها یا شب‌های بسته را یک‌جا وارد کنید — اول پیش‌نمایش، بعد ثبت نهایی."
      >
        <ImportWizard />
      </Card>
    </div>
  );
}
