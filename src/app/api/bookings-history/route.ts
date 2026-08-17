import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import type { BookingHistoryRow } from "@/lib/customers";

export const dynamic = "force-dynamic";

interface DbBookingHistory {
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

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM bookings_history ORDER BY check_in DESC, id DESC")
    .all() as DbBookingHistory[];

  const bookings: BookingHistoryRow[] = rows.map((r) => ({
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

  return NextResponse.json({ bookings, count: bookings.length });
}
