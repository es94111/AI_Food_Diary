import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  await prisma.savedFood.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
