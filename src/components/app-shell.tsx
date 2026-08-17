"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  IconCalendar,
  IconClose,
  IconCompetitors,
  IconData,
  IconDashboard,
  IconInsight,
  IconMarket,
  IconMenu,
  IconMoney,
  IconPercent,
  IconStar,
} from "./icons";

const NAV = [
  { href: "/", label: "نمای کلی", icon: IconDashboard, description: "شاخص‌های عملکرد" },
  { href: "/market", label: "مقایسه بازار", icon: IconMarket, description: "جایگاه قیمتی" },
  { href: "/calendar", label: "تقویم قیمت", icon: IconCalendar, description: "نرخ شبانه" },
  { href: "/finance", label: "مالی من", icon: IconPercent, description: "هزینه و سود واقعی" },
  { href: "/competitors", label: "رقبا", icon: IconCompetitors, description: "اقامتگاه‌های مشابه" },
  { href: "/revenue", label: "درآمد منطقه", icon: IconMoney, description: "رتبه‌بندی رقبا" },
  { href: "/reviews", label: "نظرات", icon: IconStar, description: "تحلیل بازخورد" },
  { href: "/insights", label: "پیشنهادها", icon: IconInsight, description: "اقدام‌های عملی" },
  { href: "/data", label: "منبع داده", icon: IconData, description: "وضعیت دیتاست" },
];

const ORIGIN_BADGE = {
  real: {
    label: "داده واقعی جاجیگا",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  missing: {
    label: "داده در دسترس نیست",
    className: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
} as const;

export type ShellOrigin = keyof typeof ORIGIN_BADGE;

export function AppShell({
  children,
  propertyTitle,
  propertyArea,
  origin,
}: {
  children: React.ReactNode;
  propertyTitle: string;
  propertyArea: string;
  origin: ShellOrigin;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const badge = ORIGIN_BADGE[origin];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      {/* ------------------------------ Sidebar ------------------------------ */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[17rem] transform border-l border-white/8 bg-ink-900/95 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 lg:bg-ink-900/50 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-5">
            <Link href="/" className="flex items-center gap-3">
              <Logo />
              <span>
                <span className="block text-base font-extrabold tracking-tight text-white">
                  میزبان‌یار
                </span>
                <span className="block text-[11px] text-slate-400">تحلیل هوشمند اقامتگاه</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="بستن منو"
            >
              <IconClose className="size-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-brand-500/12 text-brand-200 ring-1 ring-brand-500/25"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`size-5 shrink-0 ${active ? "text-brand-300" : "text-slate-500 group-hover:text-slate-300"}`}
                  />
                  <span className="flex-1">
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-[11px] text-slate-500">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/8 p-4">
            <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/6">
              <p className="text-[11px] text-slate-400">اقامتگاه فعال</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-100">
                {propertyTitle}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{propertyArea}</p>
              <span
                className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badge.className}`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {badge.label}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="بستن منو"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      {/* ------------------------------- Content ----------------------------- */}
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-white/8 bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="باز کردن منو"
            >
              <IconMenu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-slate-100 lg:text-base">
                {NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)))
                  ?.label ?? "میزبان‌یار"}
              </h1>
              <p className="truncate text-[11px] text-slate-500">{propertyTitle}</p>
            </div>
            <span
              className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 sm:inline-flex ${badge.className}`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {badge.label}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t border-white/8 px-4 py-5 text-center text-[11px] text-slate-500 lg:px-8">
          میزبان‌یار — داده واقعی جاجیگا. تحلیل‌ها برآوردی هستند و جایگزین قضاوت میزبان نمی‌شوند.
        </footer>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/20">
      <svg viewBox="0 0 24 24" className="size-5 text-ink-950" fill="none" aria-hidden="true">
        <path
          d="M4 11.2 12 5l8 6.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.2 10.4V18a1 1 0 0 0 1 1h9.6a1 1 0 0 0 1-1v-7.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.6 19v-4.2h4.8V19"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
