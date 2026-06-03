import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptMetricValue } from "@/lib/field-crypto";

// Returns the historical time series for one or more metric types so the health
// dashboard can show a per-metric trend when a tile is tapped. The latest value
// lives on the cards; this endpoint backs the "歷史數據" drill-down.

// Mirror of the sync route's accepted metric types — guards the `types` param so
// a caller can't trigger an unbounded/odd query.
const ALLOWED_TYPES = new Set([
  "STEPS",
  "WEIGHT",
  "ACTIVE_CALORIES",
  "TOTAL_CALORIES",
  "BASAL_CALORIES",
  "EXERCISE",
  "SLEEP",
  "SLEEP_DEEP",
  "SLEEP_LIGHT",
  "SLEEP_REM",
  "SLEEP_AWAKE",
  "HEART_RATE",
  "RESTING_HEART_RATE",
  "HRV",
  "RESPIRATORY_RATE",
  "BLOOD_OXYGEN",
  "BLOOD_PRESSURE_SYSTOLIC",
  "BLOOD_PRESSURE_DIASTOLIC",
  "BLOOD_GLUCOSE",
  "BODY_FAT",
  "BMI",
  "LEAN_BODY_MASS",
  "BODY_WATER_MASS",
  "BODY_TEMPERATURE",
  "SKIN_TEMPERATURE",
  "HEIGHT",
  "DISTANCE",
  "SPEED",
  "FLIGHTS_CLIMBED",
  "ACTIVITY_INTENSITY",
  "NUTRITION",
  "WATER"
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);

    // `types` is comma-separated: a single type for most tiles, or every sleep
    // stage together for the sleep drill-down.
    const types = (url.searchParams.get("types") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => ALLOWED_TYPES.has(t));
    if (types.length === 0) {
      return NextResponse.json({ error: "缺少有效的健康指標類型。" }, { status: 400 });
    }

    // How many readings back to plot, per type. Clamped so the chart stays
    // readable and the query stays bounded.
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 7), 120);

    // One bounded query per type so sparse metrics (WATER, WEIGHT) still return a
    // full window instead of being crowded out by a denser metric.
    const series = await Promise.all(
      types.map(async (type) => {
        const rows = await prisma.healthMetric.findMany({
          where: { userId: user.id, type },
          orderBy: { measuredAt: "desc" },
          take: limit,
          select: { unit: true, measuredAt: true, value: true, encValue: true }
        });
        // Oldest→newest for left-to-right charting.
        const points = rows
          .reverse()
          .map((row) => ({ at: row.measuredAt.toISOString(), value: decryptMetricValue(row) }));
        return { type, unit: rows[0]?.unit ?? "", points };
      })
    );

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
