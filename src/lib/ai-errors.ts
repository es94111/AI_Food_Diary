import { NextResponse } from "next/server";
import { APIError } from "openai";
import { apiError, HttpError } from "@/lib/http";

// Shared error translator for the AI analysis endpoints. They all wrap the same
// provider call and previously duplicated an identical catch ladder that mapped
// our internal markers to friendly messages — but let any *upstream* provider
// error (a Gemini 400, a relay's 503 "No available accounts", an auth failure)
// fall through to a generic "try again later" 500, hiding the real cause.
//
// This keeps the known-marker mapping and adds a branch that surfaces the
// provider's own status + message, so the user can tell a config/key problem
// from a provider outage instead of guessing.

// Pulls a human-readable detail out of an OpenAI.APIError. The SDK populates
// `.error` with the structured `{ message, type }` body when the provider sends
// one (e.g. the relay's "No available accounts"); when the body is empty/gzipped
// and unparsed (Gemini's "400 status code (no body)") there is nothing useful to
// add beyond the status code, so we return "".
function upstreamDetail(error: APIError): string {
  const structured = error.error as { message?: unknown } | null | undefined;
  if (structured && typeof structured.message === "string" && structured.message.trim()) {
    return structured.message.trim();
  }
  // error.message is like "400 status code (no body)" — drop that boilerplate so
  // we don't echo a redundant status; keep anything more specific.
  const stripped = typeof error.message === "string" ? error.message.replace(/^\d+\s+status code\s*\(no body\)\s*$/i, "").trim() : "";
  return stripped;
}

export function aiErrorResponse(
  error: unknown,
  options: { logLabel: string; fallbackMessage: string; emptyContentMessage?: string }
): NextResponse {
  if (error instanceof HttpError) return apiError(error);

  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(options.logLabel, error);

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
    return NextResponse.json({ error: options.emptyContentMessage ?? "AI 服務沒有回傳分析內容，請確認模型是否可用。" }, { status: 502 });
  }
  if (message.includes("Unexpected token") || message.includes("JSON") || message === "OPENAI_RESPONSE_NOT_PARSEABLE") {
    return NextResponse.json({ error: "AI 回傳格式無法解析，請調整提示語要求只輸出 JSON。" }, { status: 502 });
  }

  // Upstream provider error: surface its real status + message. We answer with
  // 502 (we are acting as a gateway to the provider) so it stays distinct from
  // our own 400 validation errors; the status the user needs is in the text.
  if (error instanceof APIError) {
    const status = typeof error.status === "number" && error.status > 0 ? error.status : "連線失敗";
    const detail = upstreamDetail(error);
    const hint =
      error.status === 401 || error.status === 403
        ? "API 金鑰可能無效或無權限，請至「使用者設定 → AI 設定」確認金鑰。"
        : error.status === 429
          ? "已達供應商速率或額度上限，請稍後再試或檢查方案額度。"
          : "這通常是供應商端的問題（金鑰、額度或服務暫時不可用），請確認 AI 設定或稍後再試。";
    return NextResponse.json(
      { error: `AI 服務商回應錯誤（${status}${detail ? `：${detail}` : ""}）。${hint}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ error: options.fallbackMessage }, { status: 500 });
}
