import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptMeal, encryptMealItemWrite, encryptMealNotesWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { mealUpdateSchema } from "@/lib/validators";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";

export const GET = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    include: { items: true }
  });

  if (!meal) return NextResponse.json({ error: "找不到餐點" }, { status: 404 });
  return NextResponse.json({ meal: decryptMeal(meal) });
});

export const DELETE = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true, imageStorageKeys: true }
  });
  await prisma.meal.deleteMany({ where: { id, userId: user.id } });

  // Delete every associated image from object storage (fall back to the legacy
  // single key for old rows), but only when no saved food / other meal still
  // references the same object — meal photos picked from a saved food share its
  // key rather than copying it. The meal row is already deleted above, so it
  // won't count itself as a reference.
  const keys = meal?.imageStorageKeys.length
    ? meal.imageStorageKeys
    : meal?.imageStorageKey
      ? [meal.imageStorageKey]
      : [];
  for (const key of keys) {
    await deleteImageIfUnreferenced(key);
  }

  return NextResponse.json({ ok: true });
});

export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = mealUpdateSchema.parse(await request.json());
  const existing = await prisma.meal.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "找不到餐點" }, { status: 404 });

  const totals = body.items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbs: acc.carbs + item.carbs
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const meal = await prisma.$transaction(async (tx) => {
    await tx.mealItem.deleteMany({ where: { mealId: id } });
    return tx.meal.update({
      where: { id },
      data: {
        mealType: body.mealType,
        totalCalories: totals.calories,
        totalProtein: totals.protein,
        totalFat: totals.fat,
        totalCarbs: totals.carbs,
        ...encryptMealNotesWrite("使用者已修正餐點項目。"),
        items: {
          create: body.items.map((item) => encryptMealItemWrite(item))
        }
      },
      include: { items: true }
    });
  });

  return NextResponse.json({ meal: decryptMeal(meal) });
});
