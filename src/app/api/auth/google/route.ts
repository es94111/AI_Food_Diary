import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { createSession, hashPassword } from "@/lib/auth";
import { isPrismaErrorCode, prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { GoogleAuthError, verifyGoogleIdToken } from "@/lib/google";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/turnstile";

const bodySchema = z.object({ idToken: z.string().min(10) });

export const POST = apiRoute(async (request: Request) => {
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

  // Only a previously-bound account may sign in via Google. SECURITY: we do
  // NOT match by email any more. Local registration has no email verification,
  // so anyone could pre-register a victim's email; silently binding the victim's
  // later Google login into that attacker-controlled account would hand them
  // shared access (account pre-harvesting). Legitimate users merge accounts via
  // the explicit flow: sign in with password → Settings → link Google.
  let user: { id: string; email: string; name: string | null; tokenVersion: number } | null =
    await prisma.user.findFirst({ where: { googleId: identity.sub } });
  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: identity.email } });
    if (existingByEmail) {
      return NextResponse.json(
        {
          error:
            "此 Email 已有密碼帳號。請先用密碼登入，再到「設定 → 帳號」綁定 Google 以後即可使用 Google 登入。"
        },
        { status: 409 }
      );
    }
  }

  if (!user) {
    // The count-then-create for bootstrap admin is racy under concurrent first
    // registrations; re-evaluate inside a SERIALIZABLE transaction (loser retries).
    const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    const registrationOpen = config?.registrationOpen ?? true;
    if (!registrationOpen) {
      return NextResponse.json({ error: "目前未開放公開註冊，請聯絡管理員以取得帳號。" }, { status: 403 });
    }

    let created: { id: string; email: string; name: string | null; tokenVersion: number } | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.$transaction(
          async (tx) => {
            const isFirstUser = (await tx.user.count()) === 0;
            const newUser = await tx.user.create({
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
              await tx.appConfig.upsert({
                where: { id: "singleton" },
                create: { id: "singleton", registrationOpen: true },
                update: {}
              });
            }
            return newUser;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        // A concurrent signup claimed the same email between our pre-checks and
        // the create — same guidance as the pre-check above.
        if (isPrismaErrorCode(error, "P2002")) {
          return NextResponse.json(
            { error: "此 Email 已有密碼帳號。請先用密碼登入，再到「設定 → 帳號」綁定 Google 以後即可使用 Google 登入。" },
            { status: 409 }
          );
        }
        if (!isPrismaErrorCode(error, "P2034")) {
          throw error;
        }
      }
    }
    if (!created) {
      return NextResponse.json({ error: "Google 登入失敗，請稍後再試。" }, { status: 500 });
    }
    user = created;
  }

  await createSession(user.id, user.tokenVersion);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
});
