import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";
import { loadDataset } from "@/lib/load-dataset";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "میزبان‌یار | تحلیل هوشمند اقامتگاه",
    template: "%s | میزبان‌یار",
  },
  description:
    "داشبورد تحلیل عملکرد، قیمت‌گذاری و رقبای اقامتگاه برای میزبانان جاجیگا — از بابلکنار مازندران تا سراسر ایران.",
  applicationName: "میزبان‌یار",
  keywords: ["میزبان‌یار", "جاجیگا", "اقامتگاه", "بابلکنار", "تحلیل قیمت", "اجاره کوتاه‌مدت"],
};

export const viewport: Viewport = {
  themeColor: "#070b16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const dataset = loadDataset();

  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <AppShell
          propertyTitle={dataset.property.title}
          propertyArea={`${dataset.property.city} — ${dataset.property.area}`}
          origin={dataset.origin}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
