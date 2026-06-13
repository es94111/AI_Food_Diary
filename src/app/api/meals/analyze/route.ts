import { NextResponse } from "next/server";
import { analyzeMealImage, analyzeMealImageStable } from "@/lib/ai";
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
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    if (images.length === 0) return NextResponse.json({ error: "請先上傳圖片再進行 AI 分析。" }, { status: 400 });
    const config = resolveUserAiConfig(user);
    // Precise mode trades ~3× tokens for a median-of-samples estimate that drifts
    // far less between identical photos.
    const analysis = body.precise
      ? await analyzeMealImageStable(config, images)
      : await analyzeMealImage(config, images);
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Meal preview analysis failed",
      fallbackMessage: "餐點分析失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。"
    });
  }
}
