import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { addBlock, addExpense, addReservation } from "@/lib/db/repo";
import { importBlocks, importExpenses, importReservations } from "@/lib/import";
import type { ImportKind } from "@/lib/import";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB is plenty for host CSVs

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    kind?: ImportKind;
    text?: string;
    commit?: boolean;
  } | null;

  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  }
  if (body.text.length > MAX_SIZE) {
    return NextResponse.json({ error: "فایل بزرگ‌تر از ۲ مگابایت است" }, { status: 413 });
  }
  if (body.kind !== "reservations" && body.kind !== "expenses" && body.kind !== "blocks") {
    return NextResponse.json({ error: "نوع فایل مشخص نیست" }, { status: 400 });
  }

  if (body.kind === "reservations") {
    const result = importReservations(body.text);
    if (body.commit) {
      const db = getDb();
      for (const row of result.valid) addReservation(db, row);
      refresh();
    }
    return NextResponse.json({
      valid: result.valid.length,
      invalid: result.invalid,
      columns: result.columns,
      committed: body.commit === true,
      preview: result.valid.slice(0, 5),
    });
  }

  if (body.kind === "expenses") {
    const result = importExpenses(body.text);
    if (body.commit) {
      const db = getDb();
      for (const row of result.valid) addExpense(db, row);
      refresh();
    }
    return NextResponse.json({
      valid: result.valid.length,
      invalid: result.invalid,
      columns: result.columns,
      committed: body.commit === true,
      preview: result.valid.slice(0, 5),
    });
  }

  const result = importBlocks(body.text);
  if (body.commit) {
    const db = getDb();
    for (const row of result.valid) addBlock(db, row);
    refresh();
  }
  return NextResponse.json({
    valid: result.valid.length,
    invalid: result.invalid,
    columns: result.columns,
    committed: body.commit === true,
    preview: result.valid.slice(0, 5),
  });
}

function refresh() {
  revalidatePath("/finance");
  revalidatePath("/calendar");
  revalidatePath("/");
}
