import { NextResponse } from "next/server";
import { analyzeMealImage } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/encryption";
import { startOfLocalDay, addDays } from "@/lib/dates";
import { mealSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const day = url.searchParams.get("date") ? new Date(`${url.searchParams.get("date")}T00:00:00`) : new Date();
  const start = startOfLocalDay(day);
  const end = addDays(start, 1);

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } },
    include: { items: true },
    orderBy: { eatenAt: "desc" }
  });

  return NextResponse.json({ meals });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = mealSchema.parse(await request.json());
  const analysis = await analyzeMealImage(body.imageDataUrl);

  const meal = await prisma.meal.create({
    data: {
      userId: user.id,
      mealType: body.mealType,
      eatenAt: body.eatenAt ? new Date(body.eatenAt) : new Date(),
      totalCalories: analysis.total.calories,
      totalProtein: analysis.total.protein,
      totalFat: analysis.total.fat,
      totalCarbs: analysis.total.carbs,
      aiConfidence: analysis.confidence,
      aiNotes: analysis.notes,
      aiRawEncrypted: encryptJson(analysis),
      items: {
        create: analysis.foods.map((food) => ({
          name: food.name,
          estimatedAmount: food.estimatedAmount,
          calories: food.calories,
          protein: food.protein,
          fat: food.fat,
          carbs: food.carbs
        }))
      }
    },
    include: { items: true }
  });

  return NextResponse.json({ meal });
}
