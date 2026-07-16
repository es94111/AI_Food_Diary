import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { getDecryptedImage, isStorageKey, uploadImage } from "@/lib/storage";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { mealImageAppendSchema, MAX_MEAL_IMAGES } from "@/lib/validators";

// Normalises a meal's stored image keys, preferring the per-image list and
// falling back to the legacy single key for old rows.
function currentKeys(meal: { imageStorageKey: string | null; imageStorageKeys: string[] }): string[] {
  return meal.imageStorageKeys.length ? meal.imageStorageKeys : meal.imageStorageKey ? [meal.imageStorageKey] : [];
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true, imageStorageKeys: true }
  });

  const keys = meal ? currentKeys(meal) : [];
  const index = Number(new URL(request.url).searchParams.get("i") ?? "0");
  const key = Number.isInteger(index) && index >= 0 && index < keys.length ? keys[index] : undefined;
  if (!key) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });

  if (!isStorageKey(key)) {
    const match = key.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return NextResponse.json({ error: "圖片格式不支援" }, { status: 400 });
    return new NextResponse(Buffer.from(match[2], "base64"), {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "private, no-store"
      }
    });
  }

  const image = await getDecryptedImage(key);
  if (!image) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=60"
    }
  });
}

// Retroactively attach photos to an existing meal (the describe/manual flows
// don't capture one). Appends to the meal's image list, keeping imageStorageKey
// pointed at the first for backward compatibility.
export const POST = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const { imageDataUrls } = mealImageAppendSchema.parse(await request.json());

  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true, imageStorageKeys: true }
  });
  if (!meal) return NextResponse.json({ error: "找不到餐點" }, { status: 404 });

  const existing = currentKeys(meal);
  const room = MAX_MEAL_IMAGES - existing.length;
  if (room <= 0) {
    return NextResponse.json({ error: `每筆餐點最多 ${MAX_MEAL_IMAGES} 張圖片。` }, { status: 400 });
  }

  const accepted = imageDataUrls.slice(0, room);
  const uploadedKeys: string[] = [];
  try {
    for (const dataUrl of accepted) {
      uploadedKeys.push(await uploadImage(dataUrl, user.id));
    }
    const keys = [...existing, ...uploadedKeys];

    await prisma.meal.update({
      where: { id },
      data: { imageStorageKeys: keys, imageStorageKey: keys[0] ?? null }
    });

    const skipped = imageDataUrls.length - accepted.length;
    return NextResponse.json({ imageCount: keys.length, skipped });
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => deleteImageIfUnreferenced(key).catch(() => undefined)));
    throw error;
  }
});

// Remove a single photo from a meal by its index (?i=).
export const DELETE = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true, imageStorageKeys: true }
  });
  if (!meal) return NextResponse.json({ error: "找不到餐點" }, { status: 404 });

  const keys = currentKeys(meal);
  const index = Number(new URL(request.url).searchParams.get("i") ?? "-1");
  if (!Number.isInteger(index) || index < 0 || index >= keys.length) {
    return NextResponse.json({ error: "找不到圖片" }, { status: 404 });
  }

  const [removed] = keys.splice(index, 1);
  await prisma.meal.update({
    where: { id },
    data: { imageStorageKeys: keys, imageStorageKey: keys[0] ?? null }
  });

  // The key may still be referenced by the source saved food (or another meal),
  // since meal photos picked from a saved food share its object — only delete
  // once nothing else points at it.
  await deleteImageIfUnreferenced(removed);

  return NextResponse.json({ imageCount: keys.length });
});
