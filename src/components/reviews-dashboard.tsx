"use client";

/**
 * Client shell for the /reviews page: renders the insight sections and the
 * full table, and wires the theme-card "مشاهده همه در جدول" buttons to the
 * table's jump signal (filter by the theme's proof word + scroll + flash).
 */
import { useState } from "react";

import { ReviewInsights } from "./review-insights";
import { ReviewsTable } from "./reviews-table";
import type { JumpSignal, ReviewRow } from "./reviews-table";
import type { ReviewDashboardAnalytics } from "@/lib/jajiga/reviewAnalytics";

export function ReviewsDashboard({
  rows,
  total,
  analysis,
}: {
  rows: ReviewRow[];
  total: number;
  analysis: ReviewDashboardAnalytics;
}) {
  const [jump, setJump] = useState<JumpSignal | null>(null);

  return (
    <div className="space-y-4">
      <ReviewInsights
        analysis={analysis}
        onWord={(word) => setJump((prev) => ({ word, nonce: (prev?.nonce ?? 0) + 1 }))}
      />
      <ReviewsTable rows={rows} total={total} jump={jump} />
    </div>
  );
}
