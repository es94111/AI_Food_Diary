import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp, verifyTurnstile } from "@/lib/turnstile";
import { registerSchema } from "@/lib/validators";

export const POST = apiRoute(async (request: Request) => {
  const remoteIp = getClientIp(request);

  // Throttle account creation per IP to stop bot mass-registration.
  const limited = await enforceRateLimit(`register:ip:${remoteIp ?? "unknown"}`, {
    limit: 5,
    windowSec: 900,
    message: "註冊嘗試過於頻繁，請稍後再試。"
  });
  if (limited) return limited;

  const body = registerSchema.parse(await request.json());

  // First check: is this the very first user (no accounts yet)?
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;

  if (!isFirstUser) {
    const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    const registrationOpen = config?.registrationOpen ?? true;
    if (!registrationOpen) {
      return NextResponse.json({ error: "目前未開放公開註冊，請聯絡管理員以取得帳號。" }, { status: 403 });
    }
  }

  // The very first (bootstrap admin) account skips the human check so a fresh
  // deploy can be set up; everyone else must pass Turnstile (when configured).
  if (!isFirstUser) {
    const turnstileValid = await verifyTurnstile(body["cf-turnstile-response"], remoteIp);
    if (!turnstileValid) {
      return NextResponse.json({ error: "請先完成人機驗證" }, { status: 400 });
    }
  }

  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Neutral message: don't confirm whether an email is already registered.
    return NextResponse.json(
      { error: "無法使用此 Email 註冊，請改用其他 Email 或直接登入。" },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      isAdmin: isFirstUser,
      profile: { create: {} }
    }
  });

  // First user also initialises the AppConfig singleton
  if (isFirstUser) {
    await prisma.appConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", registrationOpen: true },
      update: {}
    });
  }

  await createSession(user.id, user.tokenVersion);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
});
