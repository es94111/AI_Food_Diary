import { addDays, startOfLocalDay } from "@/lib/dates";
import { prisma } from "@/lib/db";

type HealthMetric = {
  type: string;
  value: number;
  unit: string;
  measuredAt: Date;
};

export async function getHealthContext(userId: string, day = new Date()) {
  const start = startOfLocalDay(day);
  const end = addDays(start, 1);
  const metrics = await prisma.healthMetric.findMany({
    where: {
      userId,
      measuredAt: { gte: addDays(start, -14), lt: end }
    },
    orderBy: { measuredAt: "desc" },
    take: 200
  });

  const latest = latestByType(metrics);
  const todaySteps = sumToday(metrics, "STEPS", start, end);
  const todayActiveCalories = sumToday(metrics, "ACTIVE_CALORIES", start, end);

  const parts = [
    todaySteps ? `今日步數 ${Math.round(todaySteps)} 步` : "今日步數尚未同步",
    todayActiveCalories ? `今日活動消耗 ${Math.round(todayActiveCalories)} kcal` : "今日活動消耗尚未同步",
    latest.WEIGHT ? `最新體重 ${latest.WEIGHT.value.toFixed(1)} ${latest.WEIGHT.unit}` : "體重尚未同步",
    latest.SLEEP ? `最近睡眠 ${latest.SLEEP.value.toFixed(1)} ${latest.SLEEP.unit}` : "睡眠尚未同步"
  ];

  return parts.join("；");
}

export async function getLatestSyncedWeightKg(userId: string, day = new Date()) {
  const metric = await prisma.healthMetric.findFirst({
    where: {
      userId,
      type: "WEIGHT",
      unit: { equals: "kg", mode: "insensitive" },
      measuredAt: { lt: addDays(startOfLocalDay(day), 1) }
    },
    orderBy: { measuredAt: "desc" }
  });

  return metric?.value ?? null;
}

export async function getLatestSyncedHeightCm(userId: string, day = new Date()) {
  const metric = await prisma.healthMetric.findFirst({
    where: {
      userId,
      type: "HEIGHT",
      unit: { equals: "cm", mode: "insensitive" },
      measuredAt: { lt: addDays(startOfLocalDay(day), 1) }
    },
    orderBy: { measuredAt: "desc" }
  });

  return metric?.value ?? null;
}

function latestByType(metrics: HealthMetric[]) {
  return metrics.reduce<Record<string, HealthMetric>>((latest, metric) => {
    if (!latest[metric.type]) latest[metric.type] = metric;
    return latest;
  }, {});
}

function sumToday(metrics: HealthMetric[], type: string, start: Date, end: Date) {
  return metrics
    .filter((metric) => metric.type === type && metric.measuredAt >= start && metric.measuredAt < end)
    .reduce((total, metric) => total + metric.value, 0);
}
