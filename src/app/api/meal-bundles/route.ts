import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptMeal, decryptMealBundle, encryptMealBundleItemWrite } from "@/lib/b2-crypto";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/encryption";
import { apiRoute } from "@/lib/http";
import { mealBundleImagePath } from "@/lib/image-links";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { enforceMealBundleReadRateLimit, enforceMealBundleWriteRateLimit } from "@/lib/rate-limit";
import { uploadImage } from "@/lib/storage";
import { mealBundleCreateSchema } from "@/lib/validators";

function mealBundleResponse<T extends { id: string; encName?: unknown; name?: string | null; items?: Array<{ name?: string | null; estimatedAmount?: string | null; encName?: unknown; encEstimatedAmount?: unknown; calories?: unknown; protein?: unknown; fat?: unknown; carbs?: unknown }>; imageStorageKey: string | null }>(bundle: T) {
  return { ...decryptMealBundle(bundle), imageUrl: mealBundleImagePath(bundle) };
}

async function validateSavedFoodReferences(userId: string, items: Array<{ savedFoodId?: string | null }>) {
  const ids = [...new Set(items.flatMap((item) => item.savedFoodId ? [item.savedFoodId] : []))];
  if (!ids.length) return null;
  const foods = await prisma.savedFood.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
  if (foods.length !== ids.length) {
    return NextResponse.json({ error: "餐組包含不存在或不屬於你的食物。" }, { status: 400 });
  }
  return null;
}

function storedMealItems(meal: { items: Array<{ name: string | null; estimatedAmount: string | null; encName: unknown; encEstimatedAmount: unknown; calories: unknown; protein: unknown; fat: unknown; carbs: unknown; aiRating: string }> }) {
  return decryptMeal({ items: meal.items }).items.map((item) => ({
    name: item.name,
    estimatedAmount: item.estimatedAmount || "未估算",
    calories: item.calories,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    aiRating: ["GOOD", "OK", "LIMIT", "MANUAL"].includes(item.aiRating ?? "") ? item.aiRating as "GOOD" | "OK" | "LIMIT" | "MANUAL" : "MANUAL"
  }));
}

export const GET = apiRoute(async () => {
  const user = await requireUser();
  const limited = await enforceMealBundleReadRateLimit(user.id);
  if (limited) return limited;
  const bundles = await prisma.mealBundle.findMany({
    where: { userId: user.id },
    include: { items: true },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({ bundles: bundles.map(mealBundleResponse) });
});

export const POST = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const limited = await enforceMealBundleWriteRateLimit(user.id);
  if (limited) return limited;
  const body = mealBundleCreateSchema.parse(await request.json());

  let items = body.items ?? [];
  let sourceImageKey: string | null = null;
  if (body.sourceMealId) {
    const sourceMeal = await prisma.meal.findFirst({ where: { id: body.sourceMealId, userId: user.id }, include: { items: true } });
    if (!sourceMeal) return NextResponse.json({ error: "找不到來源餐點。" }, { status: 404 });
    items = storedMealItems(sourceMeal);
    if (!items.length) return NextResponse.json({ error: "來源餐點沒有可另存的食物項目。" }, { status: 400 });
    sourceImageKey = sourceMeal.imageStorageKeys[0] ?? sourceMeal.imageStorageKey;
  }
  const invalidReference = await validateSavedFoodReferences(user.id, items);
  if (invalidReference) return invalidReference;

  let uploadedKey: string | undefined;
  try {
    if (body.imageDataUrl) uploadedKey = await uploadImage(body.imageDataUrl, user.id);
    const bundle = await prisma.mealBundle.create({
      data: {
        userId: user.id,
        encName: encryptJson(body.name),
        imageStorageKey: uploadedKey ?? sourceImageKey,
        items: { create: items.map((item) => encryptMealBundleItemWrite(item)) }
      },
      include: { items: true }
    });
    return NextResponse.json({ bundle: mealBundleResponse(bundle) });
  } catch (error) {
    if (uploadedKey) await deleteImageIfUnreferenced(uploadedKey).catch(() => undefined);
    throw error;
  }
});
