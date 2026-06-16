import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { uploadImage } from "@/lib/storage";
import { savedFoodSchema } from "@/lib/validators";

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

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (barcode) {
    const food = await prisma.savedFood.findFirst({ where: { userId: user.id, barcode, archivedAt: null } });
    if (food) {
      await prisma.savedFood.update({
        where: { id: food.id },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() }
      });
    }
    return NextResponse.json({ food: food ? decryptSavedFood(food) : null });
  }
  const foods = await prisma.savedFood.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }, { useCount: "desc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json({
    foods: foods.map(decryptSavedFood)
  });
});

export const POST = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const body = savedFoodSchema.parse(await request.json());
  const imageData = await resolveSavedFoodImage(body, user.id);
  const existing = body.barcode
    ? await prisma.savedFood.findFirst({ where: { userId: user.id, barcode: body.barcode } })
    : null;
  const food = existing
    ? await prisma.savedFood.update({
        where: { id: existing.id },
        data: { ...encryptSavedFoodWrite(body), ...imageData, archivedAt: null }
      })
    : await prisma.savedFood.create({
        data: {
          userId: user.id,
          ...encryptSavedFoodWrite(body),
          ...imageData
        }
      });
  return NextResponse.json({ food: decryptSavedFood(food) });
});
