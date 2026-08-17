"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { parseJalaliInput, toJalali } from "@/lib/dates";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from "@/lib/db/schemas";
import type { ExpenseRow, RecurringRow } from "@/lib/db/schemas";
import { formatToman } from "@/lib/metrics";

/* ------------------------------ shared bits ------------------------------ */

const inputClass =
  "w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-brand-400/50";

const labelClass = "mb-1 block text-[11px] font-bold text-slate-400";

/** Parse a toman amount typed with Persian digits / thousands separators. */
function parseAmount(value: string): number | null {
  const normalized = value
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[,،٬\s]/g, "")
    .replace(/تومان/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-[11px] font-bold text-rose-300">{message}</p>;
}

/* ------------------------------ expense form ------------------------------ */

export function ExpenseForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(toJalali(defaultDate));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("cleaning");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const iso = parseJalaliInput(date);
    if (!iso) return setError("تاریخ شمسی معتبر نیست — مثال: ۱۴۰۵/۰۵/۲۶");
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return setError("مبلغ معتبر نیست — فقط عدد تومان");

    setBusy(true);
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: iso, amount: parsedAmount, category, note }),
    });
    setBusy(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return setError(body?.error ?? "ثبت هزینه ناموفق بود");
    }
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>تاریخ (شمسی)</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="۱۴۰۵/۰۵/۲۶"
        />
      </div>
      <div>
        <label className={labelClass}>مبلغ (تومان)</label>
        <input
          dir="ltr"
          className={`${inputClass} num text-center`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="۳۵۰٬۰۰۰"
          inputMode="numeric"
        />
      </div>
      <div>
        <label className={labelClass}>دسته</label>
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {EXPENSE_CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>یادداشت (اختیاری)</label>
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثلاً تعویض شیر آب"
        />
      </div>
      <div className="col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-500/90 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "در حال ثبت…" : "ثبت هزینه"}
        </button>
        <ErrorText message={error} />
      </div>
    </form>
  );
}

/* ------------------------------ expense list ------------------------------ */

export function ExpenseList({ expenses }: { expenses: ExpenseRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function remove(id: number) {
    setBusyId(id);
    await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  if (!expenses.length) {
    return (
      <p className="py-8 text-center text-[12px] text-slate-500">
        هنوز هزینه‌ای برای این ماه ثبت نشده است.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-right text-[12px]">
        <thead>
          <tr className="border-b border-white/8 text-[11px] text-slate-500">
            <th className="py-2 font-semibold">تاریخ</th>
            <th className="py-2 font-semibold">دسته</th>
            <th className="py-2 font-semibold">مبلغ</th>
            <th className="py-2 font-semibold">یادداشت</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id} className="border-b border-white/5 last:border-0">
              <td className="num py-2 text-slate-300">{toJalali(expense.date)}</td>
              <td className="py-2 text-slate-300">
                {EXPENSE_CATEGORY_LABEL[expense.category]}
                {expense.recurringId ? (
                  <span className="mr-1.5 text-[10px] text-slate-500">(تکرارشونده)</span>
                ) : null}
              </td>
              <td className="num py-2 font-bold text-slate-100">{formatToman(expense.amount)}</td>
              <td className="py-2 text-slate-400">{expense.note || "—"}</td>
              <td className="py-2 text-left">
                <button
                  onClick={() => remove(expense.id)}
                  disabled={busyId === expense.id}
                  className="rounded-md px-2 py-1 text-[11px] text-rose-300/80 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                >
                  حذف
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- recurring costs ---------------------------- */

export function RecurringManager({ recurrings }: { recurrings: RecurringRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("misc");
  const [day, setDay] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsedAmount = parseAmount(amount);
    if (!title.trim()) return setError("عنوان لازم است");
    if (!parsedAmount) return setError("مبلغ معتبر نیست");
    const dayOfMonth = Number(day.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))));
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return setError("روز ماه باید بین ۱ تا ۳۱ باشد");
    }

    setBusy(true);
    const response = await fetch("/api/recurrings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        amount: parsedAmount,
        category,
        dayOfMonth,
        active: true,
      }),
    });
    setBusy(false);
    if (!response.ok) return setError("ثبت ناموفق بود");
    setTitle("");
    setAmount("");
    router.refresh();
  }

  async function toggle(id: number, active: boolean) {
    await fetch("/api/recurrings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    router.refresh();
  }

  async function remove(id: number) {
    await fetch(`/api/recurrings?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>عنوان</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً حقوق سرایدار"
          />
        </div>
        <div>
          <label className={labelClass}>مبلغ ماهانه (تومان)</label>
          <input
            dir="ltr"
            className={`${inputClass} num text-center`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="۴٬۰۰۰٬۰۰۰"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={labelClass}>دسته</label>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {EXPENSE_CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>روز ماه (شمسی)</label>
          <input
            dir="ltr"
            className={`${inputClass} num text-center`}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-white/8 px-4 py-2 text-[12px] font-bold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/12 disabled:opacity-50"
          >
            افزودن هزینه تکرارشونده
          </button>
          <ErrorText message={error} />
        </div>
      </form>

      {recurrings.length ? (
        <ul className="space-y-2">
          {recurrings.map((recurring) => (
            <li
              key={recurring.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-3 py-2 text-[12px] ring-1 ring-white/8"
            >
              <div>
                <span className={recurring.active ? "text-slate-200" : "text-slate-500 line-through"}>
                  {recurring.title}
                </span>
                <span className="num mr-2 text-slate-400">{formatToman(recurring.amount)}</span>
                <span className="mr-2 text-[10px] text-slate-500">
                  {EXPENSE_CATEGORY_LABEL[recurring.category]} · روز {recurring.dayOfMonth}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggle(recurring.id, !recurring.active)}
                  className="rounded-md px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/8 hover:text-slate-200"
                >
                  {recurring.active ? "غیرفعال" : "فعال"}
                </button>
                <button
                  onClick={() => remove(recurring.id)}
                  className="rounded-md px-2 py-1 text-[11px] text-rose-300/80 transition hover:bg-rose-500/10 hover:text-rose-300"
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">
          هزینه ثابت ماهانه (مثل حقوق سرایدار یا اینترنت) را یک‌بار تعریف کنید تا هر ماه خودکار ثبت شود.
        </p>
      )}
    </div>
  );
}
