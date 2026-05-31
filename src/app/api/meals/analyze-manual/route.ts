import { NextResponse } from "next/server";
import { analyzeManualFoodItems } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { requireUser } from "@/lib/auth";
import { mealSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = mealSchema.parse(await request.json());
    const manualItems = body.manualItems ?? [];
    if (manualItems.length === 0) return NextResponse.json({ error: "請先新增至少一項食物再進行 AI 評分。" }, { status: 400 });

    const analysis = await analyzeManualFoodItems(resolveUserAiConfig(user), manualItems.map((item) => ({ ...item, aiRating: item.aiRating ?? "MANUAL" })));
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Manual food rating failed", error);
    if (message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: "尚未設定 AI 金鑰，請點右上角「使用者設定 → AI 設定」選擇服務商並輸入你的 API 金鑰。" }, { status: 400 });
    }
    if (message === "OPENAI_API_KEY is required") {
      return NextResponse.json({ error: "尚未設定 OPENAI_API_KEY，請先在 .env 填入 API Key 後重啟 app/worker。" }, { status: 400 });
    }
    if (message === "OPENAI_RESPONSE_MISSING_CHOICES") {
      return NextResponse.json({ error: "AI 服務回應格式不相容，請確認 OPENAI_BASE_URL 是否為 OpenAI-compatible /v1 API。" }, { status: 502 });
    }
    if (message === "OPENAI_RESPONSE_EMPTY_CONTENT") {
      return NextResponse.json({ error: "AI 服務沒有回傳分析內容，請確認文字模型是否可用。" }, { status: 502 });
    }
    if (message.includes("Unexpected token") || message.includes("JSON") || message === "OPENAI_RESPONSE_NOT_PARSEABLE") {
      return NextResponse.json({ error: "AI 回傳格式無法解析，請調整提示語要求只輸出 JSON。" }, { status: 502 });
    }
    return NextResponse.json({ error: "手動食物 AI 評分失敗，請稍後再試。" }, { status: 500 });
  }
}
