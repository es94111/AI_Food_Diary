import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeNutritionLabelImage } from "@/lib/ai";
import { requireUser } from "@/lib/auth";

const nutritionLabelSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/")
});

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = nutritionLabelSchema.parse(await request.json());
    const analysis = await analyzeNutritionLabelImage(body.imageDataUrl);
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Nutrition label analysis failed", error);
    if (message === "OPENAI_API_KEY is required") {
      return NextResponse.json({ error: "尚未設定 OPENAI_API_KEY，請先在 .env 填入 API Key 後重啟 app/worker。" }, { status: 400 });
    }
    if (message === "OPENAI_RESPONSE_MISSING_CHOICES") {
      return NextResponse.json({ error: "AI 服務回應格式不相容，請確認 OPENAI_BASE_URL 是否為 OpenAI-compatible /v1 API。" }, { status: 502 });
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
