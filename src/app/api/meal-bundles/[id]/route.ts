import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptMealBundle, encryptMealBundleItemWrite } from "@/lib/b2-crypto";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/encryption";
import { apiRoute } from "@/lib/http";
import { mealBundleImagePath } from "@/lib/image-links";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { enforceMealBundleReadRateLimit, enforceMealBundleWriteRateLimit } from "@/lib/rate-limit";
import { uploadImage } from "@/lib/storage";
import { mealBundlePatchSchema } from "@/lib/validators";

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

export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const limited = await enforceMealBundleWriteRateLimit(user.id);
  if (limited) return limited;
  const { id } = await context.params;
  const body = mealBundlePatchSchema.parse(await request.json());
  const existing = await prisma.mealBundle.findFirst({ where: { id, userId: user.id }, include: { items: true } });
  if (!existing) return NextResponse.json({ error: "找不到餐組。" }, { status: 404 });

  if (body.items) {
    const invalidReference = await validateSavedFoodReferences(user.id, body.items);
    if (invalidReference) return invalidReference;
  }

  let uploadedKey: string | undefined;
  try {
    if (body.imageDataUrl) uploadedKey = await uploadImage(body.imageDataUrl, user.id);
    const imageStorageKey = uploadedKey ?? (body.removeImage ? null : undefined);
    const bundle = await prisma.mealBundle.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { encName: encryptJson(body.name) } : {}),
        ...(imageStorageKey !== undefined ? { imageStorageKey } : {}),
        ...(body.items ? {
          items: {
            deleteMany: {},
            create: body.items.map((item) => encryptMealBundleItemWrite(item))
          }
        } : {})
      },
      include: { items: true }
    });
    if (imageStorageKey !== undefined && existing.imageStorageKey && existing.imageStorageKey !== imageStorageKey) {
      await deleteImageIfUnreferenced(existing.imageStorageKey).catch((error) => {
        console.error("Failed to clean up replaced meal-bundle image", error);
      });
    }
    return NextResponse.json({ bundle: mealBundleResponse(bundle) });
  } catch (error) {
    if (uploadedKey) await deleteImageIfUnreferenced(uploadedKey).catch(() => undefined);
    throw error;
  }
});

export const DELETE = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const limited = await enforceMealBundleWriteRateLimit(user.id);
  if (limited) return limited;
  const { id } = await context.params;
  const existing = await prisma.mealBundle.findFirst({ where: { id, userId: user.id }, select: { imageStorageKey: true } });
  if (!existing) return NextResponse.json({ error: "找不到餐組。" }, { status: 404 });
  await prisma.mealBundle.delete({ where: { id } });
  if (existing.imageStorageKey) await deleteImageIfUnreferenced(existing.imageStorageKey);
  return NextResponse.json({ ok: true });
});

export const GET = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const limited = await enforceMealBundleReadRateLimit(user.id);
  if (limited) return limited;
  const { id } = await context.params;
  const bundle = await prisma.mealBundle.findFirst({ where: { id, userId: user.id }, include: { items: true } });
  if (!bundle) return NextResponse.json({ error: "找不到餐組。" }, { status: 404 });
  return NextResponse.json({ bundle: mealBundleResponse(bundle) });
});
