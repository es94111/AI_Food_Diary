import { NextResponse } from "next/server";
import OpenAI from "openai";
import { aiErrorResponse } from "@/lib/ai-errors";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { requireUser } from "@/lib/auth";
import { decryptJson } from "@/lib/encryption";
import { HttpError } from "@/lib/http";
import { assertSafeCompatibleBaseUrl } from "@/lib/url-guard";
import { aiModelListSchema } from "@/lib/validators";

// Decrypts the user's stored API key, mirroring resolveUserAiConfig. Returns ""
// when there is no key or it can't be decrypted, so the caller can decide.
function storedApiKey(encrypted: unknown): string {
  if (!encrypted || typeof encrypted !== "object") return "";
  try {
    const value = decryptJson<string>(encrypted as never);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

// Lists the models the provider exposes via the OpenAI-compatible `GET /models`
// endpoint, so the settings UI can offer a live picklist instead of a hardcoded
// guess. Accepts a freshly-typed key (before the user saves) and falls back to
// the saved key otherwise.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = aiModelListSchema.parse(await request.json());
    const provider = AI_PROVIDERS[body.provider];

    const apiKey = body.apiKey?.trim() || storedApiKey(user.profile?.encryptedAiApiKey);
    if (!apiKey) {
      throw new HttpError(400, "AI_KEY_REQUIRED", "請先輸入 API 金鑰再載入模型清單。");
    }

    // Hosted providers use the fixed catalog base URL; "compatible" uses the
    // user's endpoint, which must pass the same SSRF guard as when it's saved.
    const baseUrl = provider.requiresBaseUrl
      ? assertSafeCompatibleBaseUrl(body.baseUrl?.trim() || "")
      : provider.baseUrl;

    const client = new OpenAI({ apiKey, baseURL: baseUrl.replace(/\/+$/, "") });
    const list = await client.models.list();

    // Gemini's OpenAI-compat layer returns ids like "models/gemini-2.5-flash";
    // strip the prefix so they match what the user types and our catalog uses.
    const models = Array.from(
      new Set(
        (list.data ?? [])
          .map((model) => (typeof model.id === "string" ? model.id.replace(/^models\//, "").trim() : ""))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ models });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "AI model list failed",
      fallbackMessage: "無法載入模型清單，請確認 API 金鑰與 Base URL 後再試。"
    });
  }
}
