import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { addBlock, listBlocks, removeBlock } from "@/lib/db/repo";
import { blockInput } from "@/lib/db/schemas";

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;
  return NextResponse.json({ blocks: listBlocks(getDb(), from, to) });
}

export async function POST(request: NextRequest) {
  const parsed = blockInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر" },
      { status: 400 },
    );
  }
  const block = addBlock(getDb(), parsed.data);
  refresh();
  return NextResponse.json({ block }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "تاریخ نامعتبر" }, { status: 400 });
  }
  const removed = removeBlock(getDb(), date);
  refresh();
  return NextResponse.json({ removed });
}
