import { NextResponse } from "next/server";
import { reestimateFoodItems } from "@/lib/ai";
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
    const manualItems = (body.manualItems ?? []).filter((item) => item.name.trim());
    if (manualItems.length === 0) {
      return NextResponse.json({ error: "請先修正至少一項食物再重新辨識。" }, { status: 400 });
    }

    const analysis = await reestimateFoodItems(
      resolveUserAiConfig(user),
      manualItems.map((item) => ({ name: item.name, estimatedAmount: item.estimatedAmount }))
    );
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Food re-estimate failed",
      fallbackMessage: "重新 AI 辨識失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認文字模型是否可用。"
    });
  }
}
