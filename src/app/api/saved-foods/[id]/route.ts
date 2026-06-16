import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { savedFoodPatchSchema } from "@/lib/validators";
import { resolveSavedFoodImage } from "../route";

export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = savedFoodPatchSchema.parse(await request.json());
  const existing = await prisma.savedFood.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "找不到常用食物。" }, { status: 404 });
  const imageData = await resolveSavedFoodImage(body, user.id);
  const food = await prisma.savedFood.update({
    where: { id },
    data: {
      ...encryptSavedFoodWrite(body),
      ...imageData,
      archivedAt: body.archived ? new Date() : null
    }
  });
  return NextResponse.json({ food: decryptSavedFood(food) });
});

export const POST = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const existing = await prisma.savedFood.findFirst({ where: { id, userId: user.id, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "找不到常用食物。" }, { status: 404 });
  const food = await prisma.savedFood.update({
    where: { id },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() }
  });
  return NextResponse.json({ food: decryptSavedFood(food) });
});

export const DELETE = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  await prisma.savedFood.updateMany({ where: { id, userId: user.id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
});
