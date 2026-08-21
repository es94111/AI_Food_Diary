import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { analyzeBrandSearchCandidates } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { aiErrorResponse } from "@/lib/ai-errors";
import { requireUser } from "@/lib/auth";
import { enforceAiRateLimit, enforceBrandSearchRateLimit } from "@/lib/rate-limit";
import { brandSearchSchema } from "@/lib/validators";
import { WebSearchNotConfiguredError, WebSearchRequestError, webSearch } from "@/lib/web-search";

// Hard ceiling on "search + AI judgement" combined, enforced with a single
// AbortController shared by both steps below — not just a design target (see
// research.md §5, tasks.md T013). Left under SC-001's 30s user-perceived budget
// so the client and network still have room.
const BRAND_SEARCH_TOTAL_TIMEOUT_MS = 25_000;

function formatSearchResultsText(results: Array<{ title: string; content: string }>): string {
  return results.map((result) => `【${result.title}】${result.content}`).join("\n\n");
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRAND_SEARCH_TOTAL_TIMEOUT_MS);
  try {
    const user = await requireUser();
    const searchLimited = await enforceBrandSearchRateLimit(user.id);
    if (searchLimited) return searchLimited;
    const aiLimited = await enforceAiRateLimit(user.id);
    if (aiLimited) return aiLimited;

    const body = brandSearchSchema.parse(await request.json());
    const config = resolveUserAiConfig(user);

    const results = await webSearch(`${body.brand} ${body.itemName} 營養標示`, { signal: controller.signal });
    const { candidates } = await analyzeBrandSearchCandidates(
      config,
      { brand: body.brand, itemName: body.itemName, searchResultsText: formatSearchResultsText(results) },
      { signal: controller.signal }
    );

    // candidates: [] is a normal 200 (查無結果, FR-007) — not an error.
    return NextResponse.json({ candidates });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "請確認廠牌與品項名稱皆已填寫。" }, { status: 400 });
    }
    if (error instanceof WebSearchNotConfiguredError) {
      return NextResponse.json(
        { error: "品牌搜尋功能尚未設定，請改用手動輸入或上傳營養標示。" },
        { status: 503 }
      );
    }
    if (controller.signal.aborted || error instanceof WebSearchRequestError) {
      return NextResponse.json({ error: "搜尋逾時，請稍後再試。" }, { status: 502 });
    }
    return aiErrorResponse(error, {
      logLabel: "Brand search analysis failed",
      fallbackMessage: "品牌搜尋失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認文字模型是否可用。"
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
