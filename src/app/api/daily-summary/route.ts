import { NextResponse } from "next/server";
import { AiNotConfiguredError } from "@/lib/ai-config";
import { requireUser } from "@/lib/auth";
import { decryptDailySummary } from "@/lib/b2-crypto";
import { generateAndStoreDailySummary } from "@/lib/daily-summary";
import { prisma } from "@/lib/db";
import { dayRangeUtc, normalizeDateStr, todayStr } from "@/lib/dates";
import { apiRoute } from "@/lib/http";
import { enforceAiRateLimit } from "@/lib/rate-limit";
import { resolveRequestTz } from "@/lib/timezone";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const { start } = dayRangeUtc(dateStr, tz);
  const summaryDate = start;

  const existing = await prisma.dailySummary.findUnique({
    where: { userId_summaryDate: { userId: user.id, summaryDate } }
  });
  if (existing) return NextResponse.json({ summary: decryptDailySummary(existing) });

  // Peek mode: return the stored summary only, without spending AI quota to
  // generate one. Used by the web/app to auto-display an existing summary on load.
  if (url.searchParams.get("generate") !== "1") {
    return NextResponse.json({ summary: null });
  }

  if (dateStr >= todayStr(tz)) {
    return NextResponse.json(
      { error: "今日總結需等今天結束後才能產生。" },
      { status: 400 }
    );
  }

  // Past this point we spend AI quota — apply the shared per-user budget.
  const limited = await enforceAiRateLimit(user.id);
  if (limited) return limited;

  let summary;
  try {
    summary = await generateAndStoreDailySummary(user, dateStr, tz);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: "尚未設定 AI 金鑰，請點右上角「使用者設定 → AI 設定」選擇服務商並輸入你的 API 金鑰。" }, { status: 400 });
    }
    throw error;
  }
  // No meals that day → nothing to summarise.
  if (!summary) return NextResponse.json({ summary: null });

  return NextResponse.json({ summary: decryptDailySummary(summary) });
});
