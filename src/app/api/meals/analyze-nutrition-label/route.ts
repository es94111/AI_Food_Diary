import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeNutritionLabelImage } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { requireUser } from "@/lib/auth";
import { apiError, HttpError } from "@/lib/http";
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
    if (error instanceof HttpError) return apiError(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Nutrition label analysis failed", error);
    if (message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: "尚未設定 AI 金鑰，請點右上角「使用者設定 → AI 設定」選擇服務商並輸入你的 API 金鑰。" }, { status: 400 });
    }
    if (message === "OPENAI_API_KEY is required") {
      return NextResponse.json({ error: "尚未設定 OPENAI_API_KEY，請先在 .env 填入 API Key 後重啟 app/worker。" }, { status: 400 });
    }
    if (message === "OPENAI_RESPONSE_MISSING_CHOICES") {
      return NextResponse.json({ error: "AI 服務回應格式不相容，請確認 AI 服務商、Base URL、模型名稱與 API 金鑰是否屬於同一個平台，且端點為 OpenAI-compatible chat completions API。" }, { status: 502 });
    }
    if (message === "OPENAI_RESPONSE_EMPTY_CONTENT") {
      return NextResponse.json({ error: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。" }, { status: 502 });
    }
    if (message.includes("Unexpected token") || message.includes("JSON") || message === "OPENAI_RESPONSE_NOT_PARSEABLE") {
      return NextResponse.json({ error: "AI 回傳格式無法解析，請調整提示語要求只輸出 JSON。" }, { status: 502 });
    }
    return NextResponse.json({ error: "營養標示分析失敗，請稍後再試。" }, { status: 500 });
  }
}
