import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeNutritionLabelImage } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { aiErrorResponse } from "@/lib/ai-errors";
import { requireUser } from "@/lib/auth";
import { enforceAiRateLimit } from "@/lib/rate-limit";

const nutritionLabelSchema = z
  .object({
    imageDataUrl: z.string().startsWith("data:image/").optional(),
    imageDataUrls: z.array(z.string().startsWith("data:image/")).min(1).max(5).optional()
  })
  .refine((v) => !!v.imageDataUrl || !!v.imageDataUrls?.length, {
    message: "請先上傳營養標示圖片。"
  });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceAiRateLimit(user.id);
    if (limited) return limited;
    const body = nutritionLabelSchema.parse(await request.json());
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    const analysis = await analyzeNutritionLabelImage(resolveUserAiConfig(user), images);
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Nutrition label analysis failed",
      fallbackMessage: "營養標示分析失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。"
    });
  }
}
