import { prisma } from "@/lib/db";

type HealthMetric = {
  type: string;
  value: number;
  unit: string;
  measuredAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Callers pass the UTC bounds of the target day, already computed in the user's
// timezone (see @/lib/dates), so "today" lines up with the user's calendar day.
export async function getHealthContext(userId: string, dayStart: Date, dayEnd: Date) {
  const metrics = await prisma.healthMetric.findMany({
    where: {
      userId,
      measuredAt: { gte: new Date(dayStart.getTime() - 14 * DAY_MS), lt: dayEnd }
    },
    orderBy: { measuredAt: "desc" },
    take: 200
  });

  const latest = latestByType(metrics);
  const todaySteps = sumToday(metrics, "STEPS", dayStart, dayEnd);
  const todayActiveCalories = sumToday(metrics, "ACTIVE_CALORIES", dayStart, dayEnd);

  const parts = [
    todaySteps ? `今日步數 ${Math.round(todaySteps)} 步` : "今日步數尚未同步",
    todayActiveCalories ? `今日活動消耗 ${Math.round(todayActiveCalories)} kcal` : "今日活動消耗尚未同步",
    latest.WEIGHT ? `最新體重 ${latest.WEIGHT.value.toFixed(1)} ${latest.WEIGHT.unit}` : "體重尚未同步",
    latest.SLEEP ? `最近睡眠 ${latest.SLEEP.value.toFixed(1)} ${latest.SLEEP.unit}` : "睡眠尚未同步"
  ];

  return parts.join("；");
}

export async function getLatestSyncedWeightKg(userId: string, before: Date) {
  const metric = await prisma.healthMetric.findFirst({
    where: {
      userId,
      type: "WEIGHT",
      unit: { equals: "kg", mode: "insensitive" },
      measuredAt: { lt: before }
    },
    orderBy: { measuredAt: "desc" }
  });

  return metric?.value ?? null;
}

export async function getLatestSyncedHeightCm(userId: string, before: Date) {
  const metric = await prisma.healthMetric.findFirst({
    where: {
      userId,
      type: "HEIGHT",
      unit: { equals: "cm", mode: "insensitive" },
      measuredAt: { lt: before }
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
