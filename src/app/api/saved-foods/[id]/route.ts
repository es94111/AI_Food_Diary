import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { savedFoodSchema } from "@/lib/validators";

export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = savedFoodSchema.parse(await request.json());
  const existing = await prisma.savedFood.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "找不到常用食物。" }, { status: 404 });
  const food = await prisma.savedFood.update({
    where: { id },
    data: encryptSavedFoodWrite(body)
  });
  return NextResponse.json({ food: decryptSavedFood(food) });
});

export const DELETE = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  await prisma.savedFood.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
});
