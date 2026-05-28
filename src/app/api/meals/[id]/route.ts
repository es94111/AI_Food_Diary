import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    include: { items: true }
  });

  if (!meal) return NextResponse.json({ error: "找不到餐點" }, { status: 404 });
  return NextResponse.json({ meal });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  await prisma.meal.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
