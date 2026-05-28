import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const body = loginSchema.parse(await request.json());
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
    return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
