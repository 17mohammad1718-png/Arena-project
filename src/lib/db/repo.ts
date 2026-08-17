import type Database from "better-sqlite3";

import { nightsBetween } from "../dates";
import type {
  BlockInput,
  BlockRow,
  ExpenseInput,
  ExpenseRow,
  RecurringInput,
  RecurringRow,
  ReservationInput,
  ReservationRow,
} from "./schemas";

/**
 * Data access for host-owned records. Every function takes the connection as
 * its first argument so tests can run against an in-memory database.
 */

/* ---------------------------------- rows --------------------------------- */

interface DbExpense {
  id: number;
  date: string;
  amount: number;
  category: string;
  note: string;
  recurring_id: number | null;
  created_at: string;
}

interface DbRecurring {
  id: number;
  title: string;
  amount: number;
  category: string;
  day_of_month: number;
  active: number;
  created_at: string;
}

interface DbReservation {
  id: number;
  check_in: string;
  check_out: string;
  guests: number | null;
  gross_amount: number;
  discount_amount: number;
  source: string;
  status: string;
  note: string;
  created_at: string;
}

interface DbBlock {
  id: number;
  date: string;
  reason: string;
  created_at: string;
}

/* -------------------------------- expenses ------------------------------- */

function mapExpense(row: DbExpense): ExpenseRow {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    category: row.category as ExpenseRow["category"],
    note: row.note,
    recurringId: row.recurring_id,
    createdAt: row.created_at,
  };
}

export function listExpenses(db: Database.Database, from?: string, to?: string): ExpenseRow[] {
  const rows = (
    from && to
      ? db
          .prepare("SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC")
          .all(from, to)
      : db.prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC").all()
  ) as DbExpense[];
  return rows.map(mapExpense);
}

export function addExpense(
  db: Database.Database,
  input: ExpenseInput,
  recurringId: number | null = null,
): ExpenseRow {
  const info = db
    .prepare(
      "INSERT INTO expenses (date, amount, category, note, recurring_id) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.date, input.amount, input.category, input.note, recurringId);
  const row = db
    .prepare("SELECT * FROM expenses WHERE id = ?")
    .get(info.lastInsertRowid) as DbExpense;
  return mapExpense(row);
}

export function deleteExpense(db: Database.Database, id: number): boolean {
  return db.prepare("DELETE FROM expenses WHERE id = ?").run(id).changes > 0;
}

/* ------------------------------- recurrings ------------------------------ */

function mapRecurring(row: DbRecurring): RecurringRow {
  return {
    id: row.id,
    title: row.title,
    amount: row.amount,
    category: row.category as RecurringRow["category"],
    dayOfMonth: row.day_of_month,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export function listRecurrings(db: Database.Database): RecurringRow[] {
  const rows = db.prepare("SELECT * FROM recurrings ORDER BY id").all() as DbRecurring[];
  return rows.map(mapRecurring);
}

export function addRecurring(db: Database.Database, input: RecurringInput): RecurringRow {
  const info = db
    .prepare(
      "INSERT INTO recurrings (title, amount, category, day_of_month, active) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.title, input.amount, input.category, input.dayOfMonth, input.active ? 1 : 0);
  const row = db
    .prepare("SELECT * FROM recurrings WHERE id = ?")
    .get(info.lastInsertRowid) as DbRecurring;
  return mapRecurring(row);
}

export function setRecurringActive(db: Database.Database, id: number, active: boolean): boolean {
  return (
    db.prepare("UPDATE recurrings SET active = ? WHERE id = ?").run(active ? 1 : 0, id).changes > 0
  );
}

export function deleteRecurring(db: Database.Database, id: number): boolean {
  return db.prepare("DELETE FROM recurrings WHERE id = ?").run(id).changes > 0;
}

/**
 * Materialize active recurring costs as real expense rows for one Jalali
 * month, given the ISO dates that month spans. Idempotent: skips a recurring
 * that already produced an expense inside the window.
 */
export function applyRecurrings(
  db: Database.Database,
  monthDates: string[],
): ExpenseRow[] {
  if (!monthDates.length) return [];
  const from = monthDates[0];
  const to = monthDates[monthDates.length - 1];
  const created: ExpenseRow[] = [];

  const recurrings = listRecurrings(db).filter((r) => r.active);
  const existing = db
    .prepare(
      "SELECT recurring_id FROM expenses WHERE recurring_id IS NOT NULL AND date >= ? AND date <= ?",
    )
    .all(from, to) as { recurring_id: number }[];
  const done = new Set(existing.map((row) => row.recurring_id));

  for (const recurring of recurrings) {
    if (done.has(recurring.id)) continue;
    // Clamp the requested day into the month (months are 29-31 days long).
    const index = Math.min(recurring.dayOfMonth, monthDates.length) - 1;
    created.push(
      addExpense(
        db,
        {
          date: monthDates[index],
          amount: recurring.amount,
          category: recurring.category,
          note: recurring.title,
        },
        recurring.id,
      ),
    );
  }
  return created;
}

/* ------------------------------ reservations ----------------------------- */

function mapReservation(row: DbReservation): ReservationRow {
  return {
    id: row.id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    grossAmount: row.gross_amount,
    discountAmount: row.discount_amount,
    source: row.source as ReservationRow["source"],
    status: row.status as ReservationRow["status"],
    note: row.note,
    createdAt: row.created_at,
  };
}

export function listReservations(db: Database.Database): ReservationRow[] {
  const rows = db
    .prepare("SELECT * FROM reservations ORDER BY check_in DESC, id DESC")
    .all() as DbReservation[];
  return rows.map(mapReservation);
}

/** Confirmed reservations that cover at least one night in [from, to]. */
export function reservationsInRange(
  db: Database.Database,
  from: string,
  to: string,
): ReservationRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM reservations
       WHERE status = 'confirmed' AND check_in <= ? AND check_out > ?
       ORDER BY check_in`,
    )
    .all(to, from) as DbReservation[];
  return rows.map(mapReservation);
}

export function addReservation(db: Database.Database, input: ReservationInput): ReservationRow {
  const info = db
    .prepare(
      `INSERT INTO reservations
       (check_in, check_out, guests, gross_amount, discount_amount, source, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.checkIn,
      input.checkOut,
      input.guests,
      input.grossAmount,
      input.discountAmount,
      input.source,
      input.status,
      input.note,
    );
  const row = db
    .prepare("SELECT * FROM reservations WHERE id = ?")
    .get(info.lastInsertRowid) as DbReservation;
  return mapReservation(row);
}

export function setReservationStatus(
  db: Database.Database,
  id: number,
  status: "confirmed" | "cancelled",
): boolean {
  return db.prepare("UPDATE reservations SET status = ? WHERE id = ?").run(status, id).changes > 0;
}

export function deleteReservation(db: Database.Database, id: number): boolean {
  return db.prepare("DELETE FROM reservations WHERE id = ?").run(id).changes > 0;
}

/** Map of night -> reservation for confirmed stays, e.g. for calendar overlays. */
export function reservationNights(
  db: Database.Database,
  from: string,
  to: string,
): Map<string, ReservationRow> {
  const map = new Map<string, ReservationRow>();
  for (const reservation of reservationsInRange(db, from, to)) {
    for (const night of nightsBetween(reservation.checkIn, reservation.checkOut)) {
      if (night >= from && night <= to) map.set(night, reservation);
    }
  }
  return map;
}

/* --------------------------------- blocks -------------------------------- */

function mapBlock(row: DbBlock): BlockRow {
  return { id: row.id, date: row.date, reason: row.reason, createdAt: row.created_at };
}

export function listBlocks(db: Database.Database, from?: string, to?: string): BlockRow[] {
  const rows = (
    from && to
      ? db.prepare("SELECT * FROM blocks WHERE date >= ? AND date <= ? ORDER BY date").all(from, to)
      : db.prepare("SELECT * FROM blocks ORDER BY date").all()
  ) as DbBlock[];
  return rows.map(mapBlock);
}

export function addBlock(db: Database.Database, input: BlockInput): BlockRow {
  db.prepare("INSERT OR IGNORE INTO blocks (date, reason) VALUES (?, ?)").run(
    input.date,
    input.reason,
  );
  const row = db.prepare("SELECT * FROM blocks WHERE date = ?").get(input.date) as DbBlock;
  return mapBlock(row);
}

export function removeBlock(db: Database.Database, date: string): boolean {
  return db.prepare("DELETE FROM blocks WHERE date = ?").run(date).changes > 0;
}

/* --------------------------------- export -------------------------------- */

export interface HostDataDump {
  exportedAt: string;
  expenses: ExpenseRow[];
  recurrings: RecurringRow[];
  reservations: ReservationRow[];
  blocks: BlockRow[];
}

export function dumpHostData(db: Database.Database): HostDataDump {
  return {
    exportedAt: new Date().toISOString(),
    expenses: listExpenses(db),
    recurrings: listRecurrings(db),
    reservations: listReservations(db),
    blocks: listBlocks(db),
  };
}

export function importHostData(db: Database.Database, dump: HostDataDump): void {
  const tx = db.transaction(() => {
    for (const recurring of dump.recurrings) addRecurring(db, recurring);
    for (const expense of dump.expenses) addExpense(db, expense, null);
    for (const reservation of dump.reservations) addReservation(db, reservation);
    for (const block of dump.blocks) addBlock(db, block);
  });
  tx();
}
