import { NextResponse } from "next/server";
import { AiNotConfiguredError } from "@/lib/ai-config";
import { requireUser } from "@/lib/auth";
import { normalizeDateStr, todayStr, weekStartStr } from "@/lib/dates";
import { apiRoute, isCrossSiteNavigation } from "@/lib/http";
import { enforceAiRateLimit } from "@/lib/rate-limit";
import { resolveRequestTz } from "@/lib/timezone";
import { findStoredWeeklySummary, generateAndStoreWeeklySummary } from "@/lib/weekly-summary";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const tz = resolveRequestTz(request, user.profile?.timezone);
  // Any date inside the target week resolves to the same (Mon–Sun) window, so
  // clients can pass the day they are viewing.
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const weekStart = weekStartStr(dateStr);

  const existing = await findStoredWeeklySummary(user.id, dateStr, tz);
  if (existing) return NextResponse.json({ summary: existing });

  // Peek mode: return the stored summary only, without spending AI quota. Used
  // by the web/app to auto-display an existing weekly summary on load.
  if (url.searchParams.get("generate") !== "1") {
    return NextResponse.json({ summary: null });
  }

  // Only a fully completed week can be summarised — the current week is still in
  // progress. Compare week starts in the user's own zone, not the server's UTC day.
  if (weekStart >= weekStartStr(todayStr(tz))) {
    return NextResponse.json({ error: "本週尚未結束，需等下週才能產生週報。" }, { status: 400 });
  }

  // Past this point we spend AI quota — apply the shared per-user budget, and
  // refuse cross-site navigations (SameSite=Lax lets their cookies through, so
  // a link from another site could otherwise burn the user's AI quota).
  if (isCrossSiteNavigation(request)) {
    return NextResponse.json({ error: "無法從外部網站觸發產生週報。" }, { status: 403 });
  }
  const limited = await enforceAiRateLimit(user.id);
  if (limited) return limited;

  let summary;
  try {
    summary = await generateAndStoreWeeklySummary(user, dateStr, tz);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: "尚未設定 AI 金鑰，請點右上角「使用者設定 → AI 設定」選擇服務商並輸入你的 API 金鑰。" }, { status: 400 });
    }
    throw error;
  }
  // No meals that week → nothing to summarise.
  if (!summary) return NextResponse.json({ summary: null });

  return NextResponse.json({ summary });
});
