import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { createSession, hashPassword } from "@/lib/auth";
import { isPrismaErrorCode, prisma } from "@/lib/db";
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
  const email = body.email.toLowerCase();

  // The very first (bootstrap admin) account skips the human check so a fresh
  // deploy can be set up; everyone else must pass Turnstile (when configured).
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;
  if (!isFirstUser) {
    const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    if (!(config?.registrationOpen ?? true)) {
      return NextResponse.json({ error: "目前未開放公開註冊，請聯絡管理員以取得帳號。" }, { status: 403 });
    }
    const turnstileValid = await verifyTurnstile(body["cf-turnstile-response"], remoteIp);
    if (!turnstileValid) {
      return NextResponse.json({ error: "請先完成人機驗證" }, { status: 400 });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Neutral message: don't confirm whether an email is already registered.
    return NextResponse.json(
      { error: "無法使用此 Email 註冊，請改用其他 Email 或直接登入。" },
      { status: 409 }
    );
  }

  // The count-then-create above is racy under concurrent first registrations
  // (two users could both read count=0 and both become admin). Re-evaluate
  // first-user status inside a SERIALIZABLE transaction so one writer loses
  // (P2034) and retries; only the surviving writer becomes bootstrap admin.
  let created: { id: string; email: string; name: string | null; tokenVersion: number } | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          const firstUser = (await tx.user.count()) === 0;
          const user = await tx.user.create({
            data: {
              email,
              name: body.name,
              passwordHash: await hashPassword(body.password),
              isAdmin: firstUser,
              profile: { create: {} }
            }
          });
          // First user also initialises the AppConfig singleton.
          if (firstUser) {
            await tx.appConfig.upsert({
              where: { id: "singleton" },
              create: { id: "singleton", registrationOpen: true },
              update: {}
            });
          }
          return user;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      // P2034 = serialization conflict → retry. A duplicate email raced in
      // between our pre-check and the create → same neutral 409.
      if (isPrismaErrorCode(error, "P2002")) {
        return NextResponse.json(
          { error: "無法使用此 Email 註冊，請改用其他 Email 或直接登入。" },
          { status: 409 }
        );
      }
      if (!isPrismaErrorCode(error, "P2034")) {
        throw error;
      }
    }
  }
  if (!created) {
    return NextResponse.json({ error: "註冊失敗，請稍後再試。" }, { status: 500 });
  }

  await createSession(created.id, created.tokenVersion);
  return NextResponse.json({ user: { id: created.id, email: created.email, name: created.name } });
});
