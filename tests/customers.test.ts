import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateByMonth,
  aggregateChannels,
  aggregateCustomers,
  commissionRateFor,
  summarizeHistory,
  type BookingHistoryRow,
} from "../src/lib/customers";

function booking(overrides: Partial<BookingHistoryRow>): BookingHistoryRow {
  return {
    id: 1,
    customerName: "تست",
    channel: "جاجیگا",
    netAmount: 4_000_000,
    grossAmount: 4_761_905,
    commission: 761_905,
    checkIn: "2026-05-01",
    nights: 2,
    guests: 2,
    isHourly: false,
    customerCity: "تهران",
    notes: "",
    ...overrides,
  };
}

test("commissionRateFor returns per-channel rates", () => {
  assert.equal(commissionRateFor("جاجیگا"), 0.16);
  assert.equal(commissionRateFor("جاباما"), 0.16);
  assert.equal(commissionRateFor("اتاقک"), 0.19);
  assert.equal(commissionRateFor("شب"), 0.14);
  assert.equal(commissionRateFor("پورحسین"), 0);
  assert.equal(commissionRateFor("ناشناخته"), 0);
});

test("aggregateCustomers groups by name and sorts by net", () => {
  const rows = [
    booking({ id: 1, customerName: "الف", netAmount: 5_000_000 }),
    booking({ id: 2, customerName: "ب", netAmount: 3_000_000 }),
    booking({ id: 3, customerName: "الف", netAmount: 2_000_000, checkIn: "2026-06-01" }),
  ];
  const result = aggregateCustomers(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "الف");
  assert.equal(result[0].visits, 2);
  assert.equal(result[0].net, 7_000_000);
  assert.equal(result[0].avgNet, 3_500_000);
  assert.equal(result[0].lastCheckIn, "2026-06-01");
  assert.equal(result[1].name, "ب");
  assert.equal(result[1].visits, 1);
});

test("aggregateChannels computes share and rate", () => {
  const rows = [
    booking({ id: 1, channel: "جاجیگا", netAmount: 6_000_000 }),
    booking({ id: 2, channel: "شیپور", netAmount: 4_000_000 }),
  ];
  const result = aggregateChannels(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].channel, "جاجیگا");
  assert.equal(result[0].rate, 0.16);
  assert.equal(result[0].share, 0.6);
  assert.equal(result[1].channel, "شیپور");
  assert.equal(result[1].rate, 0);
});

test("aggregateByMonth groups by month key", () => {
  const rows = [
    booking({ id: 1, checkIn: "2026-05-01" }),
    booking({ id: 2, checkIn: "2026-05-15" }),
    booking({ id: 3, checkIn: "2026-06-01" }),
  ];
  const monthKeyOf = (iso: string) => iso.slice(0, 7);
  const result = aggregateByMonth(rows, monthKeyOf);
  assert.equal(result.length, 2);
  assert.equal(result[0].monthKey, "2026-05");
  assert.equal(result[0].count, 2);
  assert.equal(result[1].monthKey, "2026-06");
  assert.equal(result[1].count, 1);
});

test("summarizeHistory computes totals and ADR", () => {
  const rows = [
    booking({ id: 1, netAmount: 4_000_000, nights: 2 }),
    booking({ id: 2, netAmount: 6_000_000, nights: 3, isHourly: true }),
  ];
  const s = summarizeHistory(rows);
  assert.equal(s.totalBookings, 2);
  assert.equal(s.totalNet, 10_000_000);
  assert.equal(s.totalNights, 5);
  assert.equal(s.adrNet, 2_000_000);
  assert.equal(s.avgNetPerBooking, 5_000_000);
  assert.equal(s.hourlyCount, 1);
  assert.equal(s.uniqueCustomers, 1); // same name "تست"
});
