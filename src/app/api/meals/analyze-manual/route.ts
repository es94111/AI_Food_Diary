import { NextResponse } from "next/server";
import { analyzeManualFoodItems } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { aiErrorResponse } from "@/lib/ai-errors";
import { requireUser } from "@/lib/auth";
import { enforceAiRateLimit } from "@/lib/rate-limit";
import { mealSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceAiRateLimit(user.id);
    if (limited) return limited;
    const body = mealSchema.parse(await request.json());
    const manualItems = body.manualItems ?? [];
    if (manualItems.length === 0) return NextResponse.json({ error: "請先新增至少一項食物再進行 AI 評分。" }, { status: 400 });

    const analysis = await analyzeManualFoodItems(resolveUserAiConfig(user), manualItems.map((item) => ({ ...item, aiRating: item.aiRating ?? "MANUAL" })));
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Manual food rating failed",
      fallbackMessage: "手動食物 AI 評分失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認文字模型是否可用。"
    });
  }
}
