import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { apiRoute } from "@/lib/http";
import { savedFoodSchema } from "@/lib/validators";

export const GET = apiRoute(async () => {
  const user = await requireUser();
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
  const food = await prisma.savedFood.create({
    data: {
      userId: user.id,
      ...encryptSavedFoodWrite(body)
    }
  });
  return NextResponse.json({ food: decryptSavedFood(food) });
});
