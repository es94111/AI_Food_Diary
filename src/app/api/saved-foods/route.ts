import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { savedFoodSchema } from "@/lib/validators";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (barcode) {
    const food = await prisma.savedFood.findFirst({ where: { userId: user.id, barcode } });
    return NextResponse.json({ food: food ? decryptSavedFood(food) : null });
  }
  const foods = await prisma.savedFood.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({
    foods: foods.map(decryptSavedFood)
  });
});

export const POST = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const body = savedFoodSchema.parse(await request.json());
  const existing = body.barcode
    ? await prisma.savedFood.findFirst({ where: { userId: user.id, barcode: body.barcode } })
    : null;
  const food = existing
    ? await prisma.savedFood.update({
        where: { id: existing.id },
        data: encryptSavedFoodWrite(body)
      })
    : await prisma.savedFood.create({
        data: {
          userId: user.id,
          ...encryptSavedFoodWrite(body)
        }
      });
  return NextResponse.json({ food: decryptSavedFood(food) });
});
