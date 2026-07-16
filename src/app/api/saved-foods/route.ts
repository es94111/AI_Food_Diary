import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { uploadImage } from "@/lib/storage";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { savedFoodCreateSchema } from "@/lib/validators";
import { canonicalBarcode, findSavedFoodMatches, type SavedFoodMatchCandidate } from "@/lib/saved-food-matching";

// Resolves the imageStorageKey change for a saved-food write: upload a new
// photo, clear it, or leave it untouched. Returns a partial to spread into the
// prisma data (an empty object means "no change").
export async function resolveSavedFoodImage(
  body: { imageDataUrl?: string; removeImage?: boolean },
  userId: string
): Promise<{ imageStorageKey?: string | null }> {
  if (body.imageDataUrl) return { imageStorageKey: await uploadImage(body.imageDataUrl, userId) };
  if (body.removeImage) return { imageStorageKey: null };
  return {};
}

function duplicateResponse(exactBarcode: ReturnType<typeof findSavedFoodMatches>["exactBarcode"], matches: ReturnType<typeof findSavedFoodMatches>["matches"]) {
  return NextResponse.json(
    {
      code: "DUPLICATE_FOOD",
      error: "可能已經存在相同或相似的食物。",
      exactBarcode: exactBarcode ?? null,
      duplicates: matches
    },
    { status: 409 }
  );
}

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const searchParams = new URL(request.url).searchParams;
  const barcode = canonicalBarcode(searchParams.get("barcode"));
  const archived = searchParams.get("archived") === "true";
  if (barcode) {
    let food = await prisma.savedFood.findFirst({ where: { userId: user.id, barcode, archivedAt: null } });
    if (!food) {
      const legacyFoods = await prisma.savedFood.findMany({
        where: { userId: user.id, archivedAt: null, barcode: { not: null } }
      });
      food = legacyFoods.find((candidate) => canonicalBarcode(candidate.barcode) === barcode) ?? null;
    }
    return NextResponse.json({ food: food ? decryptSavedFood(food) : null });
  }
  const foods = await prisma.savedFood.findMany({
    where: { userId: user.id, archivedAt: archived ? { not: null } : null },
    orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }, { useCount: "desc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json({ foods: foods.map(decryptSavedFood) });
});

export const POST = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const body = savedFoodCreateSchema.parse(await request.json());
  const normalizedBody = {
    ...body,
    barcode: canonicalBarcode(body.barcode) ?? undefined,
    isFavorite: body.isFavorite ?? false
  };
  const allowDuplicate = normalizedBody.allowDuplicate ?? false;
  const existingRows = await prisma.savedFood.findMany({ where: { userId: user.id } });
  const existingFoods: SavedFoodMatchCandidate[] = existingRows.map((row: Parameters<typeof decryptSavedFood>[0]) => {
    const food = decryptSavedFood(row) as unknown as SavedFoodMatchCandidate;
    return {
      id: String(food.id),
      name: food.name,
      estimatedAmount: food.estimatedAmount,
      barcode: food.barcode,
      calories: food.calories,
      protein: food.protein,
      fat: food.fat,
      carbs: food.carbs,
      archivedAt: food.archivedAt,
      source: food.source,
      isFavorite: food.isFavorite,
      useCount: food.useCount,
      lastUsedAt: food.lastUsedAt,
      createdAt: food.createdAt,
      updatedAt: food.updatedAt,
      hasImage: food.hasImage
    };
  });
  const input = {
    id: "new",
    name: normalizedBody.name,
    estimatedAmount: normalizedBody.estimatedAmount,
    barcode: normalizedBody.barcode,
    calories: normalizedBody.calories,
    protein: normalizedBody.protein,
    fat: normalizedBody.fat,
    carbs: normalizedBody.carbs
  };
  const { exactBarcode, matches } = findSavedFoodMatches(input, existingFoods);
  // Barcode identity is unique and cannot be bypassed with allowDuplicate.
  if (exactBarcode || (!allowDuplicate && matches.length > 0)) return duplicateResponse(exactBarcode, matches);

  const imageData = await resolveSavedFoodImage(normalizedBody, user.id);
  try {
    const food = await prisma.savedFood.create({
      data: {
        userId: user.id,
        ...encryptSavedFoodWrite(normalizedBody),
        ...imageData
      }
    });
    return NextResponse.json({ food: decryptSavedFood(food) });
  } catch (error) {
    if (imageData.imageStorageKey) {
      await deleteImageIfUnreferenced(imageData.imageStorageKey).catch(() => undefined);
    }
    // A concurrent request may win the barcode unique constraint after the
    // preflight above. Return the same actionable conflict instead of 500.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002" && normalizedBody.barcode) {
      const concurrent = await prisma.savedFood.findFirst({ where: { userId: user.id, barcode: normalizedBody.barcode } });
      if (concurrent) {
        const food = decryptSavedFood(concurrent) as unknown as SavedFoodMatchCandidate;
        return duplicateResponse({
          food: {
            id: String(food.id),
            name: food.name,
            estimatedAmount: food.estimatedAmount,
            barcode: food.barcode,
            calories: food.calories,
            protein: food.protein,
            fat: food.fat,
            carbs: food.carbs,
            archivedAt: food.archivedAt,
            source: food.source,
            isFavorite: food.isFavorite,
            useCount: food.useCount,
            lastUsedAt: food.lastUsedAt,
            createdAt: food.createdAt,
            updatedAt: food.updatedAt,
            hasImage: food.hasImage
          },
          reason: "barcode",
          score: 1,
          archived: !!concurrent.archivedAt
        }, []);
      }
    }
    throw error;
  }
});
