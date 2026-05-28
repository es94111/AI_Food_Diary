import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
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

  const body = registerSchema.parse(await request.json());
  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "此 Email 已註冊" }, { status: 409 });
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

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
