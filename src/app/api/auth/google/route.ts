import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GoogleAuthError, verifyGoogleIdToken } from "@/lib/google";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/turnstile";

const bodySchema = z.object({ idToken: z.string().min(10) });

export async function POST(request: Request) {
  const limited = await enforceRateLimit(`google:ip:${getClientIp(request) ?? "unknown"}`, {
    limit: 20,
    windowSec: 300,
    message: "登入嘗試過於頻繁，請稍後再試。"
  });
  if (limited) return limited;

  let idToken: string;
  try {
    idToken = bodySchema.parse(await request.json()).idToken;
  } catch {
    return NextResponse.json({ error: "缺少 Google 登入憑證。" }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Google 登入失敗。" }, { status: 500 });
  }

  // Prefer a previously bound account, then match by email, else create one.
  let user = await prisma.user.findFirst({ where: { googleId: identity.sub } });
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: identity.email } });
    if (user) {
      // Same email already exists — bind this Google identity to it.
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId: identity.sub } });
    }
  }

  if (!user) {
    const isFirstUser = (await prisma.user.count()) === 0;
    if (!isFirstUser) {
      const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
      if (!(config?.registrationOpen ?? true)) {
        return NextResponse.json({ error: "目前未開放公開註冊，請聯絡管理員以取得帳號。" }, { status: 403 });
      }
    }
    user = await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        googleId: identity.sub,
        // Google accounts have no local password; store an unusable random hash.
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        isAdmin: isFirstUser,
        profile: { create: {} }
      }
    });
    if (isFirstUser) {
      await prisma.appConfig.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", registrationOpen: true },
        update: {}
      });
    }
  }

  await createSession(user.id, user.tokenVersion);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
