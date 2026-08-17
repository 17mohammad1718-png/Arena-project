import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import {
  addRecurring,
  deleteRecurring,
  listRecurrings,
  setRecurringActive,
} from "@/lib/db/repo";
import { recurringInput } from "@/lib/db/schemas";

export async function GET() {
  return NextResponse.json({ recurrings: listRecurrings(getDb()) });
}

export async function POST(request: NextRequest) {
  const parsed = recurringInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر" },
      { status: 400 },
    );
  }
  const recurring = addRecurring(getDb(), parsed.data);
  revalidatePath("/finance");
  return NextResponse.json({ recurring }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: number;
    active?: boolean;
  } | null;
  if (!body || !Number.isInteger(body.id) || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  }
  const updated = setRecurringActive(getDb(), body.id as number, body.active);
  revalidatePath("/finance");
  return NextResponse.json({ updated });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }
  const removed = deleteRecurring(getDb(), id);
  revalidatePath("/finance");
  return NextResponse.json({ removed });
}
