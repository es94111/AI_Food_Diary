import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
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
      profile: { create: {} }
    }
  });

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
