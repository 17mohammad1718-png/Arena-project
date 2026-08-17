import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { addExpense, deleteExpense, listExpenses } from "@/lib/db/repo";
import { expenseInput } from "@/lib/db/schemas";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;
  return NextResponse.json({ expenses: listExpenses(getDb(), from, to) });
}

export async function POST(request: NextRequest) {
  const parsed = expenseInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر" },
      { status: 400 },
    );
  }
  const expense = addExpense(getDb(), parsed.data);
  revalidatePath("/finance");
  revalidatePath("/");
  return NextResponse.json({ expense }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }
  const removed = deleteExpense(getDb(), id);
  revalidatePath("/finance");
  revalidatePath("/");
  return NextResponse.json({ removed });
}
