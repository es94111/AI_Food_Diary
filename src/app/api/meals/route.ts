import { NextResponse } from "next/server";
import { analyzeMealImage } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/encryption";
import { decryptMeal, encryptMealItemWrite, encryptMealNotesWrite } from "@/lib/b2-crypto";
import { dayRangeUtc, normalizeDateStr } from "@/lib/dates";
import { apiError, apiRoute, HttpError } from "@/lib/http";
import { resolveRequestTz } from "@/lib/timezone";
import { mealSchema } from "@/lib/validators";
import { uploadImage } from "@/lib/storage";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const { start, end } = dayRangeUtc(dateStr, tz);

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } },
    include: { items: true },
    orderBy: { eatenAt: "desc" }
  });

  return NextResponse.json({ meals: meals.map(decryptMeal) });
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = mealSchema.parse(await request.json());
    const manualItems = body.manualItems ?? [];
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    const analysis = {
      foods: manualItems,
      total: {
        calories: manualItems.reduce((total, item) => total + item.calories, 0),
        protein: manualItems.reduce((total, item) => total + item.protein, 0),
        fat: manualItems.reduce((total, item) => total + item.fat, 0),
        carbs: manualItems.reduce((total, item) => total + item.carbs, 0)
      },
      confidence: images.length || body.description ? 0.8 : 1,
      notes: images.length
        ? "使用者已確認 AI 圖片分析結果。"
        : body.description
          ? `使用者已確認 AI 文字分析結果。原始描述：${body.description}`
          : "手動新增餐點項目。"
    };

    // Upload every photo in the batch to object storage and store their keys,
    // not the raw data URLs. imageStorageKey mirrors the first for backward compat.
    const imageStorageKeys: string[] = [];
    for (const image of images) {
      imageStorageKeys.push(await uploadImage(image, user.id));
    }
    const imageStorageKey = imageStorageKeys[0] ?? null;

    const meal = await prisma.meal.create({
      data: {
        userId: user.id,
        mealType: body.mealType,
        imageStorageKey,
        imageStorageKeys,
        eatenAt: body.eatenAt ? new Date(body.eatenAt) : new Date(),
        totalCalories: analysis.total.calories,
        totalProtein: analysis.total.protein,
        totalFat: analysis.total.fat,
        totalCarbs: analysis.total.carbs,
        aiConfidence: analysis.confidence,
        ...encryptMealNotesWrite(analysis.notes),
        aiRawEncrypted: encryptJson(analysis),
        items: {
          create: analysis.foods.map((food) => encryptMealItemWrite(food))
        }
      },
      include: { items: true }
    });

    return NextResponse.json({ meal: decryptMeal(meal) });
  } catch (error) {
    if (error instanceof HttpError) return apiError(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Meal save failed", error);
    if (message === "OPENAI_API_KEY is required") {
      return NextResponse.json(
        { error: "尚未設定 OPENAI_API_KEY，請先在 .env 填入 API Key 後重啟 app/worker。" },
        { status: 400 }
      );
    }
    if (message === "OPENAI_RESPONSE_MISSING_CHOICES") {
      return NextResponse.json(
        { error: "AI 服務回應格式不相容，請確認 AI 服務商、Base URL、模型名稱與 API 金鑰是否屬於同一個平台，且端點為 OpenAI-compatible chat completions API。" },
        { status: 502 }
      );
    }
    if (message === "OPENAI_RESPONSE_EMPTY_CONTENT") {
      return NextResponse.json({ error: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。" }, { status: 502 });
    }
    if (message.includes("Unexpected token") || message.includes("JSON")) {
      return NextResponse.json({ error: "AI 回傳格式不是有效 JSON，請調整提示語要求只輸出 JSON。" }, { status: 502 });
    }
    if (message.includes("S3_ENDPOINT") || message.includes("S3_ACCESS_KEY")) {
      return NextResponse.json({ error: "圖片上傳失敗：尚未設定 S3 儲存環境變數。" }, { status: 500 });
    }
    return NextResponse.json({ error: "餐點分析失敗，請稍後再試。" }, { status: 500 });
  }
}
