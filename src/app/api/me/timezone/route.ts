import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidTimeZone } from "@/lib/dates";

// Lightweight endpoint for clients to report their device timezone. Kept
// separate from the profile PATCH so reporting the zone never clobbers other
// profile fields, and so it can be called cheaply on every app load.
export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const timezone = typeof body?.timezone === "string" ? body.timezone : "";
  if (!isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: { timezone },
    create: { userId: user.id, timezone }
  });

  return NextResponse.json({ ok: true });
}
