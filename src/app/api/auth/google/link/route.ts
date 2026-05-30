import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GoogleAuthError, verifyGoogleIdToken } from "@/lib/google";

const bodySchema = z.object({ idToken: z.string().min(10) });

// Bind a Google account to the currently logged-in user.
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "請先登入。" }, { status: 401 });
  }

  let idToken: string;
  try {
    idToken = bodySchema.parse(await request.json()).idToken;
  } catch {
    return NextResponse.json({ error: "缺少 Google 憑證。" }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Google 綁定失敗。" }, { status: 500 });
  }

  // Reject if this Google account is already bound to a different user.
  const existing = await prisma.user.findFirst({ where: { googleId: identity.sub } });
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: "此 Google 帳號已綁定其他帳號。" }, { status: 409 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { googleId: identity.sub } });
  return NextResponse.json({ googleLinked: true, googleEmail: identity.email });
}

// Unbind the Google account from the current user.
export async function DELETE() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "請先登入。" }, { status: 401 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { googleId: null } });
  return NextResponse.json({ googleLinked: false });
}
