import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { savedFoodSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireUser();
  const foods = await prisma.savedFood.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({
    foods: foods.map((food) => ({
      ...food,
      protein: Number(food.protein),
      fat: Number(food.fat),
      carbs: Number(food.carbs)
    }))
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = savedFoodSchema.parse(await request.json());
  const food = await prisma.savedFood.create({
    data: {
      userId: user.id,
      name: body.name,
      estimatedAmount: body.estimatedAmount,
      calories: body.calories,
      protein: body.protein,
      fat: body.fat,
      carbs: body.carbs
    }
  });
  return NextResponse.json({ food: { ...food, protein: Number(food.protein), fat: Number(food.fat), carbs: Number(food.carbs) } });
}
