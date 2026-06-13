import { NextResponse } from "next/server";
import { analyzeMealDescription } from "@/lib/ai";
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
    const description = body.description?.trim();
    if (!description) return NextResponse.json({ error: "請先描述你吃了什麼再進行 AI 分析。" }, { status: 400 });

    const analysis = await analyzeMealDescription(resolveUserAiConfig(user), description);
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Meal description analysis failed",
      fallbackMessage: "餐點文字分析失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認文字模型是否可用。"
    });
  }
}
