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
  try {
    const user = await requireUser();
    const body = mealSchema.parse(await request.json());
    const manualItems = body.manualItems ?? [];
    const analysis =
      body.imageDataUrl || manualItems.length === 0
        ? await analyzeMealImage(body.imageDataUrl)
        : {
            foods: manualItems,
            total: {
              calories: manualItems.reduce((total, item) => total + item.calories, 0),
              protein: manualItems.reduce((total, item) => total + item.protein, 0),
              fat: manualItems.reduce((total, item) => total + item.fat, 0),
              carbs: manualItems.reduce((total, item) => total + item.carbs, 0)
            },
            confidence: 1,
            notes: "手動新增餐點項目。"
          };

    const meal = await prisma.meal.create({
      data: {
        userId: user.id,
        mealType: body.mealType,
        imageStorageKey: body.imageDataUrl,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Meal analysis failed", error);
    if (message === "OPENAI_API_KEY is required") {
      return NextResponse.json(
        { error: "尚未設定 OPENAI_API_KEY，請先在 .env 填入 API Key 後重啟 app/worker。" },
        { status: 400 }
      );
    }
    if (message === "OPENAI_RESPONSE_MISSING_CHOICES") {
      return NextResponse.json(
        { error: "AI 服務回應格式不相容，請確認 OPENAI_BASE_URL 是否為 OpenAI-compatible /v1 API。" },
        { status: 502 }
      );
    }
    if (message === "OPENAI_RESPONSE_EMPTY_CONTENT") {
      return NextResponse.json({ error: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。" }, { status: 502 });
    }
    if (message.includes("Unexpected token") || message.includes("JSON")) {
      return NextResponse.json({ error: "AI 回傳格式不是有效 JSON，請調整提示語要求只輸出 JSON。" }, { status: 502 });
    }
    return NextResponse.json({ error: "餐點分析失敗，請稍後再試。" }, { status: 500 });
  }
}
