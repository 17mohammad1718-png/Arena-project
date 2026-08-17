import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { createSet, deleteSet, listSets, updateSetRooms } from "@/lib/db/market";

const createInput = z.object({
  name: z.string().min(1, "نام مجموعه لازم است").max(80),
  roomIds: z.array(z.number().int().positive()).min(1, "حداقل یک اقامتگاه انتخاب کنید").max(200),
});

const updateInput = z.object({
  id: z.number().int().positive(),
  roomIds: z.array(z.number().int().positive()).min(1).max(200),
});

function refresh() {
  revalidatePath("/competitors");
  revalidatePath("/market");
}

export async function GET() {
  return NextResponse.json({ sets: listSets(getDb()) });
}

export async function POST(request: NextRequest) {
  const parsed = createInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر" },
      { status: 400 },
    );
  }
  try {
    const set = createSet(getDb(), parsed.data.name, parsed.data.roomIds);
    refresh();
    return NextResponse.json({ set }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "مجموعه‌ای با این نام وجود دارد" }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  }
  const updated = updateSetRooms(getDb(), parsed.data.id, parsed.data.roomIds);
  refresh();
  return NextResponse.json({ updated });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }
  const removed = deleteSet(getDb(), id);
  refresh();
  return NextResponse.json({ removed });
}
