import assert from "node:assert/strict";
import test from "node:test";

import {
  importBlocks,
  importExpenses,
  importReservations,
  normalizeAmount,
  normalizeDate,
  parseCsv,
} from "../src/lib/import";

/* ------------------------------ normalization ----------------------------- */

test("dates: Jalali and Gregorian, Persian digits, both separators", () => {
  assert.equal(normalizeDate("2026-09-01"), "2026-09-01");
  assert.equal(normalizeDate("2026/9/1"), "2026-09-01");
  // 1405/06/10 Jalali = 2026-09-01 Gregorian
  assert.equal(normalizeDate("1405/06/10"), "2026-09-01");
  assert.equal(normalizeDate("۱۴۰۵/۰۶/۱۰"), "2026-09-01");
  assert.equal(normalizeDate("1405-06-10"), "2026-09-01");
  assert.equal(normalizeDate("yesterday"), null);
});

test("amounts: thousands separators, Persian digits and تومان", () => {
  assert.equal(normalizeAmount("2,500,000"), 2_500_000);
  assert.equal(normalizeAmount("۲٬۵۰۰٬۰۰۰ تومان"), 2_500_000);
  assert.equal(normalizeAmount("۲۵۰۰۰۰۰"), 2_500_000);
  assert.equal(normalizeAmount("2.5m"), null);
});

test("csv parser: quoted fields, CRLF, BOM and semicolon autodetect", () => {
  const rows = parseCsv('\uFEFFa;b\r\n"x;y";"he said ""hi"""\r\n');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["x;y", 'he said "hi"'],
  ]);
});

/* -------------------------------- importers ------------------------------- */

test("reservations: Persian headers, nights instead of checkout, mixed dates", () => {
  const csv = [
    "تاریخ ورود,تعداد شب,مبلغ,تخفیف,تعداد مهمان,یادداشت",
    "۱۴۰۵/۰۶/۱۰,۲,\"12,000,000\",0,۴,مهمان تلفنی",
    "2026-09-20,3,۹٬۰۰۰٬۰۰۰ تومان,500000,2,",
  ].join("\n");

  const result = importReservations(csv);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.valid.length, 2);

  const [first, second] = result.valid;
  assert.equal(first.checkIn, "2026-09-01");
  assert.equal(first.checkOut, "2026-09-03"); // 2 nights
  assert.equal(first.grossAmount, 12_000_000);
  assert.equal(first.guests, 4);
  assert.equal(first.source, "import");

  assert.equal(second.checkIn, "2026-09-20");
  assert.equal(second.checkOut, "2026-09-23");
  assert.equal(second.discountAmount, 500_000);
});

test("reservations: bad rows are reported with line numbers, good rows survive", () => {
  const csv = [
    "checkIn,checkOut,amount",
    "2026-09-01,2026-09-03,6000000",
    "2026-09-05,2026-09-04,1000000", // checkout before checkin
    "not-a-date,2026-09-08,1000000", // bad date
    "2026-09-10,2026-09-12,", // missing amount
  ].join("\n");

  const result = importReservations(csv);
  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 3);
  assert.deepEqual(
    result.invalid.map((issue) => issue.line),
    [3, 4, 5],
  );
});

test("expenses: Persian category labels map to internal keys", () => {
  const csv = ["تاریخ,مبلغ,دسته,توضیح", "۱۴۰۵/۰۵/۲۰,۴۵۰٬۰۰۰,نظافت,بعد از مهمان"].join("\n");
  const result = importExpenses(csv);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].category, "cleaning");
  assert.equal(result.valid[0].amount, 450_000);
  assert.equal(result.valid[0].note, "بعد از مهمان");
});

test("expenses: unknown category falls back to misc, zero amount rejected", () => {
  const csv = ["date,amount,category", "2026-09-01,100000,چیز عجیب", "2026-09-02,0,نظافت"].join("\n");
  const result = importExpenses(csv);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].category, "misc");
  assert.equal(result.invalid.length, 1);
});

test("blocks: date-only file with Persian header", () => {
  const csv = ["تاریخ,دلیل", "۱۴۰۵/۰۶/۱۵,تعمیرات", "2026-09-10,"].join("\n");
  const result = importBlocks(csv);
  assert.equal(result.valid.length, 2);
  assert.equal(result.valid[0].date, "2026-09-06"); // 1405/06/15
  assert.equal(result.valid[0].reason, "تعمیرات");
});

test("a file with no recognizable header maps nothing and rejects all rows", () => {
  const result = importReservations("foo,bar\n1,2\n");
  assert.equal(result.columns.length, 0);
  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 1);
});
