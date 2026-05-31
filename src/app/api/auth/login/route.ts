import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp, verifyTurnstile } from "@/lib/turnstile";
import { loginSchema } from "@/lib/validators";

export const POST = apiRoute(async (request: Request) => {
  const body = loginSchema.parse(await request.json());
  const remoteIp = getClientIp(request);
  const email = body.email.toLowerCase();

  // Throttle by IP and by target account to blunt brute-force / credential stuffing.
  const ipLimited = await enforceRateLimit(`login:ip:${remoteIp ?? "unknown"}`, {
    limit: 15,
    windowSec: 300,
    message: "登入嘗試過於頻繁，請稍後再試。"
  });
  if (ipLimited) return ipLimited;
  const emailLimited = await enforceRateLimit(`login:email:${email}`, {
    limit: 8,
    windowSec: 900,
    message: "此帳號登入嘗試過於頻繁，請稍後再試。"
  });
  if (emailLimited) return emailLimited;

  const turnstileValid = await verifyTurnstile(body["cf-turnstile-response"], remoteIp);
  if (!turnstileValid) {
    return NextResponse.json({ error: "請先完成人機驗證" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
    return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
  }

  await createSession(user.id, user.tokenVersion);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
});
