import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import {
  addReservation,
  deleteReservation,
  listReservations,
  setReservationStatus,
} from "@/lib/db/repo";
import { reservationInput } from "@/lib/db/schemas";

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/finance");
  revalidatePath("/");
}

export async function GET() {
  return NextResponse.json({ reservations: listReservations(getDb()) });
}

export async function POST(request: NextRequest) {
  const parsed = reservationInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر" },
      { status: 400 },
    );
  }
  const reservation = addReservation(getDb(), parsed.data);
  refresh();
  return NextResponse.json({ reservation }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: number;
    status?: string;
  } | null;
  if (
    !body ||
    !Number.isInteger(body.id) ||
    (body.status !== "confirmed" && body.status !== "cancelled")
  ) {
    return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  }
  const updated = setReservationStatus(getDb(), body.id as number, body.status);
  refresh();
  return NextResponse.json({ updated });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }
  const removed = deleteReservation(getDb(), id);
  refresh();
  return NextResponse.json({ removed });
}
