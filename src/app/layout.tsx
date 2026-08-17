import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";
import { getDataset } from "@/lib/jajiga/dataset";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "میزبان‌یار | تحلیل هوشمند اقامتگاه",
    template: "%s | میزبان‌یار",
  },
  description:
    "داشبورد تحلیل عملکرد، قیمت‌گذاری و رقبای اقامتگاه برای میزبانان جاجیگا — بر پایه داده واقعی بابلکنار مازندران.",
  applicationName: "میزبان‌یار",
  keywords: ["میزبان‌یار", "جاجیگا", "اقامتگاه", "بابلکنار", "تحلیل قیمت", "اجاره کوتاه‌مدت"],
};

export const viewport: Viewport = {
  themeColor: "#070b16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const dataset = getDataset();

  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <AppShell
          propertyTitle={dataset.owner.title}
          propertyArea={`${dataset.owner.village} — بابلکنار`}
          origin={dataset.isEmpty ? "missing" : "real"}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
