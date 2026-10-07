import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getHealthHistory } from "@/lib/health-history";
import {
  DEFAULT_HEALTH_HISTORY_LIMIT,
  isHealthHistoryType,
  MAX_HEALTH_HISTORY_TYPES,
  MAX_HEALTH_HISTORY_LIMIT,
  MIN_HEALTH_HISTORY_LIMIT,
} from "@/lib/health-history-types";
import { enforceHealthHistoryRateLimit } from "@/lib/rate-limit";

// Returns the historical time series for one or more metric types so the health
// dashboard can show a per-metric trend when a tile is tapped. The latest value
// lives on the cards; this endpoint backs the "歷史數據" drill-down.

const MAX_TYPES_QUERY_LENGTH = 256;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceHealthHistoryRateLimit(user.id);
    if (limited) return limited;
    const url = new URL(request.url);

    // `types` is comma-separated: a single type for most tiles, or every sleep
    // stage together for the sleep drill-down.
    const rawTypes = url.searchParams.get("types") ?? "";
    if (rawTypes.length > MAX_TYPES_QUERY_LENGTH) {
      return NextResponse.json({ error: "健康指標類型清單過長。" }, { status: 400 });
    }
    const types = [...new Set(rawTypes
      .split(",")
      .map((t) => t.trim())
      .filter(isHealthHistoryType))];
    if (types.length === 0) {
      return NextResponse.json({ error: "缺少有效的健康指標類型。" }, { status: 400 });
    }
    if (types.length > MAX_HEALTH_HISTORY_TYPES) {
      return NextResponse.json({ error: "一次最多查詢 5 種健康指標。" }, { status: 400 });
    }

    // How many readings back to plot, per type. Clamped so the chart stays
    // readable and the query stays bounded.
    const limit = Math.min(
      Math.max(
        Number(url.searchParams.get("limit")) || DEFAULT_HEALTH_HISTORY_LIMIT,
        MIN_HEALTH_HISTORY_LIMIT,
      ),
      MAX_HEALTH_HISTORY_LIMIT,
    );

    // One bounded query per type so sparse metrics (WATER, WEIGHT) still return a
    // full window instead of being crowded out by a denser metric.
    const { series } = await getHealthHistory(user.id, types, limit);
    return NextResponse.json({ series });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Health history failed", error);
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "請先登入後再查看歷史數據。" }, { status: 401 });
    }
    return NextResponse.json({ error: "歷史數據讀取失敗，請稍後再試。" }, { status: 500 });
  }
}
