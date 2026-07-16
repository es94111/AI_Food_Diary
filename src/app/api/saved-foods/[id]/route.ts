import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { savedFoodPatchSchema } from "@/lib/validators";
import { resolveSavedFoodImage } from "../route";
import { canonicalBarcode, findSavedFoodMatches } from "@/lib/saved-food-matching";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";

export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = savedFoodPatchSchema.parse(await request.json());
  const existing = await prisma.savedFood.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "找不到食物。" }, { status: 404 });

  const current = decryptSavedFood(existing);
  const merged = {
    barcode: body.barcode === undefined ? canonicalBarcode(current.barcode) ?? undefined : canonicalBarcode(body.barcode) ?? undefined,
    name: body.name ?? current.name,
    estimatedAmount: body.estimatedAmount ?? current.estimatedAmount,
    calories: body.calories ?? current.calories,
    protein: body.protein ?? current.protein,
    fat: body.fat ?? current.fat,
    carbs: body.carbs ?? current.carbs,
    // Source records how the food entered the library. It is provenance, not
    // editable metadata, so PATCH always preserves the stored value.
    source: current.source,
    isFavorite: body.isFavorite ?? current.isFavorite
  };

  if (merged.barcode !== canonicalBarcode(current.barcode)) {
    const others = await prisma.savedFood.findMany({ where: { userId: user.id, id: { not: id } } });
    const { exactBarcode } = findSavedFoodMatches(
      { id, ...merged },
      others.map((row: Parameters<typeof decryptSavedFood>[0]) => {
        const food = decryptSavedFood(row) as Record<string, unknown>;
        return {
          id: String(food.id),
          name: String(food.name ?? ""),
          estimatedAmount: String(food.estimatedAmount ?? ""),
          barcode: typeof food.barcode === "string" ? food.barcode : null,
          calories: Number(food.calories ?? 0),
          protein: Number(food.protein ?? 0),
          fat: Number(food.fat ?? 0),
          carbs: Number(food.carbs ?? 0),
          archivedAt: food.archivedAt as Date | string | null | undefined,
          source: food.source,
          isFavorite: food.isFavorite,
          useCount: food.useCount,
          lastUsedAt: food.lastUsedAt,
          createdAt: food.createdAt,
          updatedAt: food.updatedAt,
          hasImage: food.hasImage
        };
      })
    );
    if (exactBarcode) {
      return NextResponse.json(
        { code: "DUPLICATE_FOOD", error: "此條碼已經綁定其他食物。", exactBarcode, duplicates: [] },
        { status: 409 }
      );
    }
  }

  const imageData = await resolveSavedFoodImage(body, user.id);
  const archivedAt = body.archived === undefined ? existing.archivedAt : body.archived ? new Date() : null;
  try {
    const food = await prisma.savedFood.update({
      where: { id },
      data: {
        ...encryptSavedFoodWrite(merged),
        ...imageData,
        archivedAt
      }
    });
    if ("imageStorageKey" in imageData && existing.imageStorageKey && existing.imageStorageKey !== imageData.imageStorageKey) {
      await deleteImageIfUnreferenced(existing.imageStorageKey).catch((error) => {
        console.error("Failed to clean up replaced saved-food image", error);
      });
    }
    return NextResponse.json({ food: decryptSavedFood(food) });
  } catch (error) {
    if (imageData.imageStorageKey && imageData.imageStorageKey !== existing.imageStorageKey) {
      await deleteImageIfUnreferenced(imageData.imageStorageKey).catch(() => undefined);
    }
    throw error;
  }
});

export const POST = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const existing = await prisma.savedFood.findFirst({ where: { id, userId: user.id, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "找不到食物。" }, { status: 404 });
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
