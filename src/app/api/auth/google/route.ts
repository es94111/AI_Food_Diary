import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({ idToken: z.string().min(10) });

// Google's public keys for verifying ID token signatures (cached by jose).
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "尚未設定 Google 登入（GOOGLE_CLIENT_ID）。" }, { status: 400 });
  }

  let idToken: string;
  try {
    idToken = bodySchema.parse(await request.json()).idToken;
  } catch {
    return NextResponse.json({ error: "缺少 Google 登入憑證。" }, { status: 400 });
  }

  // Verify the Google ID token: signature, issuer and audience (our client id).
  let payload: { email?: string; email_verified?: boolean | string; name?: string };
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId
    });
    payload = verified.payload as typeof payload;
  } catch {
    return NextResponse.json({ error: "Google 登入驗證失敗，請重試。" }, { status: 401 });
  }

  const email = payload.email?.toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !emailVerified) {
    return NextResponse.json({ error: "此 Google 帳號的 Email 未驗證。" }, { status: 401 });
  }

  // Log in if the account exists; otherwise create one (respecting registration).
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const isFirstUser = (await prisma.user.count()) === 0;
    if (!isFirstUser) {
      const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
      if (!(config?.registrationOpen ?? true)) {
        return NextResponse.json({ error: "目前未開放公開註冊，請聯絡管理員以取得帳號。" }, { status: 403 });
      }
    }
    // Google accounts have no local password; store an unusable random hash.
    user = await prisma.user.create({
      data: {
        email,
        name: payload.name ?? null,
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

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
