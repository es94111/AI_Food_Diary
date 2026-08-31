import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { createSession, createUnusablePasswordHash } from "@/lib/auth";
import { isPrismaErrorCode, prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { GoogleAuthError, verifyGoogleIdToken } from "@/lib/google";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { TURNSTILE_LOGIN_ACTION } from "@/lib/turnstile-config";
import { verifyTurnstile } from "@/lib/turnstile";

const bodySchema = z.object({
  idToken: z.string().min(10),
  "cf-turnstile-response": z.string().max(2048).optional()
});

class RegistrationClosedError extends Error {}

export const POST = apiRoute(async (request: Request) => {
  const clientIp = getClientIp(request);
  const limited = await enforceRateLimit(
    `google:${clientIp ? `ip:${clientIp}` : "untrusted"}`,
    {
      limit: clientIp ? 20 : 300,
      windowSec: 300,
      message: "登入嘗試過於頻繁，請稍後再試。"
    }
  );
  if (limited) return limited;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "缺少 Google 登入憑證。" }, { status: 400 });
  }

  const turnstileValid = await verifyTurnstile(
    body["cf-turnstile-response"],
    TURNSTILE_LOGIN_ACTION,
    clientIp
  );
  if (!turnstileValid) {
    return NextResponse.json({ error: "請先完成安全驗證，或重新整理後再試。" }, { status: 403 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(body.idToken);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Google 登入失敗。" }, { status: 500 });
  }

  let user: {
    id: string;
    email: string;
    name: string | null;
    tokenVersion: number;
    isDisabled: boolean;
  } | null = await prisma.user.findFirst({
    where: { googleId: identity.sub },
    select: { id: true, email: true, name: true, tokenVersion: true, isDisabled: true }
  });

  if (user?.isDisabled) {
    return NextResponse.json({ error: "此帳號已被管理員停用。" }, { status: 403 });
  }

  if (!user) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true, isDisabled: true }
    });
    if (existingByEmail?.isDisabled) {
      return NextResponse.json({ error: "此帳號已被管理員停用。" }, { status: 403 });
    }
    if (existingByEmail) {
      return NextResponse.json(
        {
          error:
            "此 Email 已有既有帳號。請在仍登入的裝置前往「設定」綁定 Google；若無法存取，請聯絡管理員。"
        },
        { status: 409 }
      );
    }
  }

  if (!user) {
    let created: {
      id: string;
      email: string;
      name: string | null;
      tokenVersion: number;
      isDisabled: boolean;
    } | null = null;

    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.$transaction(
          async (tx) => {
            const isFirstUser = (await tx.user.count()) === 0;
            if (!isFirstUser) {
              const config = await tx.appConfig.findUnique({
                where: { id: "singleton" },
                select: { registrationOpen: true }
              });
              if (config?.registrationOpen === false) {
                throw new RegistrationClosedError();
              }
            }
            return tx.user.create({
              data: {
                email: identity.email,
                name: identity.name,
                googleId: identity.sub,
                passwordHash: await createUnusablePasswordHash(),
                isAdmin: isFirstUser,
                profile: { create: {} }
              },
              select: { id: true, email: true, name: true, tokenVersion: true, isDisabled: true }
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (error instanceof RegistrationClosedError) {
          return NextResponse.json(
            { error: "目前未開放新使用者註冊；既有帳號仍可正常登入。" },
            { status: 403 }
          );
        }
        if (isPrismaErrorCode(error, "P2002")) {
          return NextResponse.json(
            {
              error:
                "此 Email 已有既有帳號。請在仍登入的裝置前往「設定」綁定 Google；若無法存取，請聯絡管理員。"
            },
            { status: 409 }
          );
        }
        if (!isPrismaErrorCode(error, "P2034")) throw error;
      }
    }

    if (!created) {
      return NextResponse.json({ error: "Google 登入失敗，請稍後再試。" }, { status: 500 });
    }
    user = created;
  }

  await createSession(user.id, user.tokenVersion);
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name }
  });
});
