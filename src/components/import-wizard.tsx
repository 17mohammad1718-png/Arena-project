"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatNumber } from "@/lib/metrics";

/**
 * Two-step CSV import (plan M4): upload -> dry-run preview with per-row
 * errors -> explicit commit. Nothing touches the database until the host
 * confirms.
 */

type Kind = "reservations" | "expenses" | "blocks";

const KIND_LABEL: Record<Kind, string> = {
  reservations: "رزروها",
  expenses: "هزینه‌ها",
  blocks: "شب‌های بسته",
};

const KIND_HINT: Record<Kind, string> = {
  reservations:
    "ستون‌های شناخته‌شده: تاریخ ورود، تاریخ خروج یا تعداد شب، مبلغ، تخفیف، تعداد مهمان، یادداشت",
  expenses: "ستون‌های شناخته‌شده: تاریخ، مبلغ، دسته، یادداشت",
  blocks: "ستون‌های شناخته‌شده: تاریخ، دلیل",
};

interface DryRun {
  valid: number;
  invalid: { line: number; message: string; raw: string }[];
  columns: string[];
  committed: boolean;
}

export function ImportWizard() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("reservations");
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function readFile(file: File) {
    setError(null);
    setDone(null);
    setResult(null);
    if (file.size > 2 * 1024 * 1024) return setError("فایل بزرگ‌تر از ۲ مگابایت است");
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    await dryRun(content, kind);
  }

  async function dryRun(content: string, forKind: Kind) {
    setBusy(true);
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: forKind, text: content, commit: false }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return setError(body?.error ?? "پردازش فایل ناموفق بود");
    }
    setResult((await response.json()) as DryRun);
  }

  async function commit() {
    if (!text) return;
    setBusy(true);
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text, commit: true }),
    });
    setBusy(false);
    if (!response.ok) return setError("ثبت نهایی ناموفق بود");
    const body = (await response.json()) as DryRun;
    setDone(`${formatNumber(body.valid)} ردیف با موفقیت ثبت شد.`);
    setResult(null);
    setText(null);
    setFileName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_LABEL) as Kind[]).map((key) => (
          <button
            key={key}
            onClick={() => {
              setKind(key);
              setResult(null);
              setDone(null);
              if (text) void dryRun(text, key);
            }}
            className={`rounded-lg px-3 py-2 text-[12px] font-bold ring-1 transition ${
              kind === key
                ? "bg-brand-500/20 text-brand-200 ring-brand-400/40"
                : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/8"
            }`}
          >
            {KIND_LABEL[key]}
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">{KIND_HINT[kind]}</p>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-white/12 bg-white/3 p-6 text-center transition hover:border-brand-400/40 hover:bg-white/5">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
        <span className="text-[12px] font-bold text-slate-300">
          {fileName ? `فایل: ${fileName}` : "فایل CSV را انتخاب کنید"}
        </span>
        <span className="mt-1 block text-[11px] text-slate-500">
          اکسل؟ فایل را با «ذخیره به‌عنوان CSV (UTF-8)» خروجی بگیرید. تاریخ شمسی و میلادی، ارقام
          فارسی، جداکننده هزارگان و «تومان» همگی پشتیبانی می‌شوند.
        </span>
      </label>

      {busy ? <p className="text-[12px] text-slate-400">در حال پردازش…</p> : null}
      {error ? <p className="text-[12px] font-bold text-rose-300">{error}</p> : null}
      {done ? <p className="text-[12px] font-bold text-emerald-300">{done}</p> : null}

      {result ? (
        <div className="space-y-3 rounded-xl bg-white/4 p-4 ring-1 ring-white/8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-slate-200">
              <strong className="text-emerald-300">{formatNumber(result.valid)}</strong> ردیف معتبر ·{" "}
              <strong className={result.invalid.length ? "text-rose-300" : "text-slate-400"}>
                {formatNumber(result.invalid.length)}
              </strong>{" "}
              ردیف نامعتبر
              {result.columns.length ? (
                <span className="mr-2 text-[11px] text-slate-500">
                  (ستون‌های شناسایی‌شده: {result.columns.join("، ")})
                </span>
              ) : null}
            </p>
            <button
              onClick={commit}
              disabled={busy || result.valid === 0}
              className="rounded-lg bg-brand-500/90 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-brand-500 disabled:opacity-40"
            >
              ثبت نهایی {formatNumber(result.valid)} ردیف
            </button>
          </div>

          {result.columns.length === 0 ? (
            <p className="text-[11px] font-bold text-amber-300">
              هیچ ستون شناخته‌شده‌ای در سطر اول پیدا نشد — نام ستون‌ها را با راهنمای بالا تطبیق دهید.
            </p>
          ) : null}

          {result.invalid.length ? (
            <div className="max-h-64 overflow-y-auto rounded-lg bg-ink-850/60 p-3">
              <p className="mb-2 text-[11px] font-bold text-rose-300">
                این ردیف‌ها ثبت نمی‌شوند (فایل اصلی را اصلاح و دوباره بارگذاری کنید):
              </p>
              <ul className="space-y-1.5">
                {result.invalid.slice(0, 50).map((issue) => (
                  <li key={`${issue.line}-${issue.message}`} className="text-[11px] text-slate-400">
                    <span className="num font-bold text-slate-300">سطر {formatNumber(issue.line)}:</span>{" "}
                    {issue.message}
                    <span className="mr-1 text-slate-600">— {issue.raw.slice(0, 80)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
