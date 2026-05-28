import { NextResponse } from "next/server";
import { analyzeMealImage } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { mealSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = mealSchema.parse(await request.json());
    if (!body.imageDataUrl) return NextResponse.json({ error: "請先上傳圖片再進行 AI 分析。" }, { status: 400 });
    const analysis = await analyzeMealImage(body.imageDataUrl);
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Meal preview analysis failed", error);
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
    return NextResponse.json({ error: "餐點分析失敗，請稍後再試。" }, { status: 500 });
  }
}
