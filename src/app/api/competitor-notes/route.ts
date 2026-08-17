import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { NOTE_LABELS, deleteNote, getNotes, upsertNote } from "@/lib/db/market";

const noteInput = z.object({
  roomId: z.number().int().positive(),
  note: z.string().max(1000).default(""),
  label: z.enum(NOTE_LABELS).nullable().default(null),
});

function refresh() {
  revalidatePath("/competitors");
}

export async function GET() {
  return NextResponse.json({ notes: [...getNotes(getDb()).values()] });
}

export async function POST(request: NextRequest) {
  const parsed = noteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  }
  const note = upsertNote(getDb(), parsed.data.roomId, parsed.data.note, parsed.data.label);
  refresh();
  return NextResponse.json({ note });
}

export async function DELETE(request: NextRequest) {
  const roomId = Number(request.nextUrl.searchParams.get("roomId"));
  if (!Number.isInteger(roomId) || roomId <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }
  const removed = deleteNote(getDb(), roomId);
  refresh();
  return NextResponse.json({ removed });
}
