"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CompetitorNote, NoteLabel } from "@/lib/db/market";
import { NOTE_LABELS, NOTE_LABEL_FA } from "@/lib/db/market";

/** Note + label editor on the competitor profile page (plan N1). */
export function CompetitorNoteEditor({
  roomId,
  initial,
}: {
  roomId: number;
  initial: CompetitorNote | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initial?.note ?? "");
  const [label, setLabel] = useState<NoteLabel | null>(initial?.label ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    await fetch("/api/competitor-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, note, label }),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  async function clear() {
    setBusy(true);
    await fetch(`/api/competitor-notes?roomId=${roomId}`, { method: "DELETE" });
    setNote("");
    setLabel(null);
    setBusy(false);
    setSaved(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {NOTE_LABELS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setLabel(label === key ? null : key)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ring-1 transition ${
              label === key
                ? "bg-brand-500/20 text-brand-200 ring-brand-400/40"
                : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/8"
            }`}
          >
            {NOTE_LABEL_FA[key]}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="مثلاً: قیمت آخر هفته‌اش را هر هفته چک کن — مستقیم‌ترین رقیب ماست."
        className="w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-[12px] leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-brand-400/50"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand-500/90 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "در حال ذخیره…" : "ذخیره یادداشت"}
        </button>
        {initial ? (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded-lg bg-white/6 px-3 py-2 text-[12px] text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            حذف یادداشت
          </button>
        ) : null}
        {saved ? <span className="text-[11px] font-bold text-emerald-300">ذخیره شد</span> : null}
      </div>
    </div>
  );
}
