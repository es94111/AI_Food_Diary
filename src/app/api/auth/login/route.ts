import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validators";

async function verifyTurnstile(token?: string, remoteIp?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.success === true;
}

export async function POST(request: Request) {
  const body = loginSchema.parse(await request.json());
  const remoteIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const turnstileValid = await verifyTurnstile(body["cf-turnstile-response"], remoteIp);
  if (!turnstileValid) {
    return NextResponse.json({ error: "請先完成人機驗證" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
    return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
