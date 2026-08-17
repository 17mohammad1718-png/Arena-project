import assert from "node:assert/strict";
import test from "node:test";

import { openTestDb } from "../src/lib/db";
import {
  addBlock,
  addExpense,
  addRecurring,
  addReservation,
  applyRecurrings,
  deleteExpense,
  dumpHostData,
  importHostData,
  listBlocks,
  listExpenses,
  listRecurrings,
  removeBlock,
  reservationNights,
  reservationsInRange,
  setReservationStatus,
} from "../src/lib/db/repo";
import { blockInput, expenseInput, reservationInput } from "../src/lib/db/schemas";

/* --------------------------------- schemas -------------------------------- */

test("expense input rejects non-positive amounts and bad dates", () => {
  assert.ok(!expenseInput.safeParse({ date: "2026-08-17", amount: 0 }).success);
  assert.ok(!expenseInput.safeParse({ date: "1405/05/26", amount: 100 }).success);
  const ok = expenseInput.safeParse({ date: "2026-08-17", amount: 250_000, category: "cleaning" });
  assert.ok(ok.success);
  assert.equal(ok.data?.note, "");
});

test("reservation input enforces checkout after checkin and sane discount", () => {
  assert.ok(
    !reservationInput.safeParse({
      checkIn: "2026-09-02",
      checkOut: "2026-09-01",
      grossAmount: 1_000_000,
    }).success,
  );
  assert.ok(
    !reservationInput.safeParse({
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      grossAmount: 1_000_000,
      discountAmount: 2_000_000,
    }).success,
  );
  assert.ok(
    reservationInput.safeParse({
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      grossAmount: 6_400_000,
    }).success,
  );
});

/* ---------------------------------- CRUD ---------------------------------- */

test("expenses: add, list by range, delete", () => {
  const db = openTestDb();
  addExpense(db, { date: "2026-08-10", amount: 300_000, category: "cleaning", note: "" });
  const kept = addExpense(db, { date: "2026-08-20", amount: 500_000, category: "repairs", note: "شیر آب" });
  addExpense(db, { date: "2026-09-05", amount: 120_000, category: "misc", note: "" });

  assert.equal(listExpenses(db).length, 3);
  const august = listExpenses(db, "2026-08-01", "2026-08-31");
  assert.equal(august.length, 2);

  assert.ok(deleteExpense(db, kept.id));
  assert.equal(listExpenses(db, "2026-08-01", "2026-08-31").length, 1);
});

test("recurrings materialize once per month and clamp the day", () => {
  const db = openTestDb();
  addRecurring(db, {
    title: "حقوق سرایدار",
    amount: 4_000_000,
    category: "misc",
    dayOfMonth: 31,
    active: true,
  });
  addRecurring(db, {
    title: "اینترنت",
    amount: 300_000,
    category: "utilities",
    dayOfMonth: 1,
    active: false, // inactive: must not materialize
  });

  // A 30-day window (like a 30-day Jalali month) — day 31 clamps to the last day.
  const dates = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
  const created = applyRecurrings(db, dates);
  assert.equal(created.length, 1);
  assert.equal(created[0].date, "2026-09-30");
  assert.equal(created[0].note, "حقوق سرایدار");

  // Second run inside the same month is a no-op.
  assert.equal(applyRecurrings(db, dates).length, 0);
  assert.equal(listExpenses(db).length, 1);
  assert.equal(listRecurrings(db).length, 2);
});

test("reservations: range query, night map and cancellation", () => {
  const db = openTestDb();
  const stay = addReservation(db, {
    checkIn: "2026-09-01",
    checkOut: "2026-09-04", // nights: 1, 2, 3
    guests: 4,
    grossAmount: 9_600_000,
    discountAmount: 600_000,
    source: "manual",
    status: "confirmed",
    note: "",
  });

  assert.equal(reservationsInRange(db, "2026-09-03", "2026-09-10").length, 1);
  assert.equal(reservationsInRange(db, "2026-09-04", "2026-09-10").length, 0, "checkout day is not a night");

  const nights = reservationNights(db, "2026-09-01", "2026-09-30");
  assert.equal(nights.size, 3);
  assert.ok(nights.has("2026-09-03"));
  assert.ok(!nights.has("2026-09-04"));

  setReservationStatus(db, stay.id, "cancelled");
  assert.equal(reservationsInRange(db, "2026-09-01", "2026-09-30").length, 0);
});

test("blocks: unique per date, add and remove", () => {
  const db = openTestDb();
  addBlock(db, { date: "2026-08-16", reason: "تعمیرات" });
  addBlock(db, { date: "2026-08-16", reason: "duplicate — ignored" });
  assert.equal(listBlocks(db).length, 1);
  assert.equal(listBlocks(db)[0].reason, "تعمیرات");

  assert.ok(removeBlock(db, "2026-08-16"));
  assert.equal(listBlocks(db).length, 0);
  assert.ok(!blockInput.safeParse({ date: "26-08-16" }).success);
});

test("dump and import round-trip preserves all host data", () => {
  const source = openTestDb();
  addExpense(source, { date: "2026-08-10", amount: 300_000, category: "cleaning", note: "" });
  addRecurring(source, {
    title: "اینترنت",
    amount: 300_000,
    category: "utilities",
    dayOfMonth: 1,
    active: true,
  });
  addReservation(source, {
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    guests: 2,
    grossAmount: 6_400_000,
    discountAmount: 0,
    source: "manual",
    status: "confirmed",
    note: "",
  });
  addBlock(source, { date: "2026-08-16", reason: "" });

  const dump = dumpHostData(source);
  const target = openTestDb();
  importHostData(target, dump);

  assert.equal(listExpenses(target).length, 1);
  assert.equal(listRecurrings(target).length, 1);
  assert.equal(reservationsInRange(target, "2026-09-01", "2026-09-30").length, 1);
  assert.equal(listBlocks(target).length, 1);
});
