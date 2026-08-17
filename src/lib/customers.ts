/**
 * Pure analytics functions over the real booking history (bookings_history).
 * No IO — testable against fixtures. All amounts in toman.
 */

export interface BookingHistoryRow {
  id: number;
  customerName: string;
  channel: string;
  netAmount: number;
  grossAmount: number;
  commission: number;
  checkIn: string; // ISO
  nights: number;
  guests: number | null;
  isHourly: boolean;
  customerCity: string;
  notes: string;
}

/* ------------------------------ commission ------------------------------- */

/** Real per-channel commission rates (verified against host's own records). */
export const CHANNEL_COMMISSION_RATE: Record<string, number> = {
  "جاجیگا": 0.16,
  "جاباما": 0.16,
  "اتاقک": 0.19,
  "شب": 0.14,
};

export function commissionRateFor(channel: string): number {
  return CHANNEL_COMMISSION_RATE[channel.trim()] ?? 0;
}

/* ------------------------------ aggregates ------------------------------- */

export interface CustomerAggregate {
  name: string;
  visits: number;
  nights: number;
  net: number;
  avgNet: number;
  lastCheckIn: string;
  city: string;
  channels: string[];
}

export function aggregateCustomers(bookings: BookingHistoryRow[]): CustomerAggregate[] {
  const map = new Map<string, CustomerAggregate & { channelSet: Set<string> }>();
  for (const b of bookings) {
    const key = b.customerName.trim() || "نامشخص";
    let entry = map.get(key);
    if (!entry) {
      entry = {
        name: key,
        visits: 0,
        nights: 0,
        net: 0,
        avgNet: 0,
        lastCheckIn: b.checkIn,
        city: b.customerCity,
        channels: [],
        channelSet: new Set<string>(),
      };
      map.set(key, entry);
    }
    entry.visits++;
    entry.nights += b.nights;
    entry.net += b.netAmount;
    if (b.checkIn > entry.lastCheckIn) entry.lastCheckIn = b.checkIn;
    if (b.customerCity && !entry.city) entry.city = b.customerCity;
    entry.channelSet.add(b.channel);
  }
  return Array.from(map.values())
    .map(({ channelSet, ...rest }) => ({
      ...rest,
      avgNet: rest.visits ? Math.round(rest.net / rest.visits) : 0,
      channels: Array.from(channelSet),
    }))
    .sort((a, b) => b.net - a.net);
}

export interface ChannelAggregate {
  channel: string;
  count: number;
  net: number;
  gross: number;
  commission: number;
  rate: number;
  share: number; // 0..1 of total net
}

export function aggregateChannels(bookings: BookingHistoryRow[]): ChannelAggregate[] {
  const map = new Map<string, ChannelAggregate>();
  for (const b of bookings) {
    const key = b.channel.trim() || "دیگر";
    let entry = map.get(key);
    if (!entry) {
      entry = {
        channel: key,
        count: 0,
        net: 0,
        gross: 0,
        commission: 0,
        rate: commissionRateFor(key),
        share: 0,
      };
      map.set(key, entry);
    }
    entry.count++;
    entry.net += b.netAmount;
    entry.gross += b.grossAmount;
    entry.commission += b.commission;
  }
  const totalNet = bookings.reduce((sum, b) => sum + b.netAmount, 0) || 1;
  return Array.from(map.values())
    .map((entry) => ({ ...entry, share: entry.net / totalNet }))
    .sort((a, b) => b.net - a.net);
}

export interface MonthAggregate {
  monthKey: string; // Jalali yyyy-MM
  count: number;
  net: number;
  nights: number;
}

export function aggregateByMonth(
  bookings: BookingHistoryRow[],
  monthKeyOf: (isoDate: string) => string,
): MonthAggregate[] {
  const map = new Map<string, MonthAggregate>();
  for (const b of bookings) {
    const key = monthKeyOf(b.checkIn);
    let entry = map.get(key);
    if (!entry) {
      entry = { monthKey: key, count: 0, net: 0, nights: 0 };
      map.set(key, entry);
    }
    entry.count++;
    entry.net += b.netAmount;
    entry.nights += b.nights;
  }
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/* -------------------------------- summary -------------------------------- */

export interface HistorySummary {
  totalBookings: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  totalNet: number;
  totalGross: number;
  totalCommission: number;
  totalNights: number;
  avgNetPerBooking: number;
  adrNet: number; // net per sold night
  hourlyCount: number;
  topChannel: string | null;
  topCustomer: string | null;
}

export function summarizeHistory(bookings: BookingHistoryRow[]): HistorySummary {
  const customers = aggregateCustomers(bookings);
  const channels = aggregateChannels(bookings);
  const totalNet = bookings.reduce((sum, b) => sum + b.netAmount, 0);
  const totalGross = bookings.reduce((sum, b) => sum + b.grossAmount, 0);
  const totalCommission = bookings.reduce((sum, b) => sum + b.commission, 0);
  const totalNights = bookings.reduce((sum, b) => sum + b.nights, 0);

  return {
    totalBookings: bookings.length,
    uniqueCustomers: customers.length,
    repeatCustomers: customers.filter((c) => c.visits >= 2).length,
    totalNet,
    totalGross,
    totalCommission,
    totalNights,
    avgNetPerBooking: bookings.length ? Math.round(totalNet / bookings.length) : 0,
    adrNet: totalNights ? Math.round(totalNet / totalNights) : 0,
    hourlyCount: bookings.filter((b) => b.isHourly).length,
    topChannel: channels[0]?.channel ?? null,
    topCustomer: customers[0]?.name ?? null,
  };
}
