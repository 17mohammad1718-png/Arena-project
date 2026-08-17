import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { dismissAlert, listAlerts } from "@/lib/db/market";

export async function GET(request: NextRequest) {
  const day = request.nextUrl.searchParams.get("day") ?? undefined;
  return NextResponse.json({ alerts: listAlerts(getDb(), day) });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { id?: number } | null;
  if (!body || !Number.isInteger(body.id)) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }
  const dismissed = dismissAlert(getDb(), body.id as number);
  revalidatePath("/");
  revalidatePath("/insights");
  return NextResponse.json({ dismissed });
}
