import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/encryption";
import { getHealthSyncUserId } from "@/lib/health-auth";

const healthMetricSchema = z.object({
  type: z.enum([
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
  ]),
  value: z.coerce.number().finite().nonnegative(),
  unit: z.string().min(1).max(32),
  measuredAt: z.string().datetime(),
  raw: z.unknown().optional()
});

const healthSyncSchema = z.object({
  source: z.string().min(1).max(80).default("HEALTH_CONNECT"),
  metrics: z.array(healthMetricSchema).min(1).max(500)
});

export async function GET(request: Request) {
  try {
    const auth = await getHealthSyncUserId(request);
    const user = auth ? { id: auth.userId } : await requireUser();
    const metrics = await prisma.healthMetric.findMany({
      where: { userId: user.id },
      orderBy: { measuredAt: "desc" },
      take: 50
    });
    const latestByType = metrics.reduce<Record<string, (typeof metrics)[number]>>((latest, metric) => {
      if (!latest[metric.type]) latest[metric.type] = metric;
      return latest;
    }, {});

    // Recent weight readings (oldest→newest) for the app's trend sparkline.
    // Queried separately so it isn't truncated by the capped `metrics` window.
    const weightRows = await prisma.healthMetric.findMany({
      where: { userId: user.id, type: "WEIGHT", unit: "kg" },
      orderBy: { measuredAt: "desc" },
      take: 14,
      select: { value: true }
    });
    const weightSeries = weightRows.map((row) => row.value).reverse();

    return NextResponse.json({
      lastSyncedAt: metrics[0]?.updatedAt ?? null,
      latestByType,
      weightSeries,
      metrics
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Health sync status failed", error);
    if (message === "Unauthorized") return NextResponse.json({ error: "請先登入後再查看健康同步狀態。" }, { status: 401 });
    return NextResponse.json({ error: "健康同步狀態讀取失敗，請稍後再試。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getHealthSyncUserId(request);
    const user = auth ? { id: auth.userId } : await requireUser();
    const body = healthSyncSchema.parse(await request.json());

    const metrics = await prisma.$transaction(
      body.metrics.map((metric) =>
        prisma.healthMetric.upsert({
          where: {
            userId_source_type_measuredAt: {
              userId: user.id,
              source: body.source,
              type: metric.type,
              measuredAt: new Date(metric.measuredAt)
            }
          },
          create: {
            userId: user.id,
            source: body.source,
            type: metric.type,
            value: metric.value,
            unit: metric.unit,
            measuredAt: new Date(metric.measuredAt),
            rawEncrypted: metric.raw === undefined ? undefined : encryptJson(metric.raw)
          },
          update: {
            value: metric.value,
            unit: metric.unit,
            rawEncrypted: metric.raw === undefined ? undefined : encryptJson(metric.raw)
          }
        })
      )
    );

    if (auth) {
      await prisma.healthConnection.update({
        where: { id: auth.id },
        data: { lastSyncedAt: new Date() }
      });
    }

    return NextResponse.json({ synced: metrics.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Health sync failed", error);
    if (message === "Unauthorized") return NextResponse.json({ error: "請先登入後再同步健康資料。" }, { status: 401 });
    if (message.includes("ENCRYPTION_KEY")) return NextResponse.json({ error: "健康資料同步失敗：尚未設定加密金鑰。" }, { status: 500 });
    if (message.includes("Invalid") || message.includes("Expected")) return NextResponse.json({ error: "健康資料格式不正確。" }, { status: 400 });
    return NextResponse.json({ error: "健康資料同步失敗，請稍後再試。" }, { status: 500 });
  }
}
