import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserTz, tzName, TZ_COOKIE } from "@/lib/timezone";
import { dayRangeUtc, todayStr } from "@/lib/dates";
import { decryptProfile } from "@/lib/profile-crypto";
import { decryptField, decryptMetricValue } from "@/lib/field-crypto";
import { calculateBmr, calculateTdee } from "@/lib/metabolism";
import {
  ActivityHero,
  HealthGroupCard,
  HEALTH_GROUPS,
  latestMetricsByType,
  Metric,
  SleepBar,
  SleepHypnogram,
  Sparkline,
  type SleepSegment
} from "@/components/health-cards";

export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const decProfile = decryptProfile(user.profile);
  const cookieStore = await cookies();
  const tz = resolveUserTz(cookieStore.get(TZ_COOKIE)?.value, user.profile?.timezone);
  // Daily metrics only show today's reading; body composition is exempt (shown
  // with its own timestamp). Compute today's UTC window in the user's zone.
  const { start: todayStart, end: todayEnd } = dayRangeUtc(todayStr(tz), tz);

  const rawHealthMetrics = await prisma.healthMetric.findMany({
    where: { userId: user.id },
    orderBy: { measuredAt: "desc" },
    take: 100
  });
  // Decrypt values up-front so every downstream aggregation sees plaintext.
  const healthMetrics = rawHealthMetrics.map((m) => ({ ...m, value: decryptMetricValue(m) }));
  // Latest value per type from a dedicated query, not the capped window above:
  // `measuredAt` is day-granular, so one day yields ~30 tied rows and `take: 100`
  // (≈3 days) can arbitrarily drop sparse metrics like WATER / NUTRITION, making
  // them show as stale/missing. `distinct` over (type) ordered by measuredAt desc
  // returns exactly the most recent row for each type.
  const latestRows = await prisma.healthMetric.findMany({
    where: { userId: user.id },
    orderBy: [{ type: "asc" }, { measuredAt: "desc" }],
    distinct: ["type"]
  });
  const latestHealthMetrics = latestMetricsByType(latestRows.map((m) => ({ ...m, value: decryptMetricValue(m) })));
  // Per-night sleep stage timeline (hypnogram), stored encrypted on the latest
  // SLEEP metric's `raw`. Absent for trackers that only report a total.
  const sleepStages = decryptField<SleepSegment[]>(latestRows.find((m) => m.type === "SLEEP")?.rawEncrypted, []);
  // Weight readings, oldest→newest, for the body-composition sparkline.
  const weightSeries = healthMetrics
    .filter((metric) => metric.type === "WEIGHT" && metric.unit.toLowerCase() === "kg")
    .slice(0, 14)
    .reverse()
    .map((metric) => metric.value);

  const syncedWeight = latestHealthMetrics.WEIGHT?.unit.toLowerCase() === "kg" ? latestHealthMetrics.WEIGHT.value : null;
  const syncedHeight = latestHealthMetrics.HEIGHT?.unit.toLowerCase() === "cm" ? latestHealthMetrics.HEIGHT.value : null;
  const effectiveProfile = decProfile
    ? { ...decProfile, weightKg: syncedWeight ?? decProfile.weightKg, heightCm: syncedHeight ?? decProfile.heightCm }
    : null;
  const bmr = calculateBmr(effectiveProfile);
  const tdee = calculateTdee(bmr, effectiveProfile?.activityLevel);
  // Sleep belongs to a single day; only show last night's chart if it's today's.
  const sleepMetric = latestHealthMetrics.SLEEP;
  const sleepIsToday = sleepMetric ? sleepMetric.measuredAt >= todayStart && sleepMetric.measuredAt < todayEnd : false;

  return (
    <>
      <header className="mt-6">
        <h1 className="text-4xl font-black tracking-tight">健康</h1>
        <p className="mt-1 text-sm text-stone-500">Health Connect 同步資料</p>
      </header>

      <div className="mt-6 space-y-6">
        <div className="glass glass-lift rounded-[2rem] p-6">
          <h2 className="text-xl font-black">健康同步</h2>
          <p className="mt-1 text-xs text-stone-500">資料由 Android App 透過 Health Connect 自動同步（步數、熱量、睡眠、運動、心率、體脂等）。請在手機 App 的「健康」分頁完成同步。</p>
        </div>
        <ActivityHero metrics={latestHealthMetrics} todayStart={todayStart} todayEnd={todayEnd} />
        {HEALTH_GROUPS.map((group) => (
          <HealthGroupCard
            key={group.id}
            group={group}
            metrics={latestHealthMetrics}
            todayStart={todayStart}
            todayEnd={todayEnd}
            tz={tzName(tz)}
            chart={
              group.id === "sleep" ? (
                sleepIsToday ? (
                  <div className="space-y-4">
                    {sleepStages.length >= 2 ? <SleepHypnogram segments={sleepStages} tz={tzName(tz)} /> : null}
                    <SleepBar
                      deep={latestHealthMetrics.SLEEP_DEEP?.value}
                      light={latestHealthMetrics.SLEEP_LIGHT?.value}
                      rem={latestHealthMetrics.SLEEP_REM?.value}
                      awake={latestHealthMetrics.SLEEP_AWAKE?.value}
                    />
                  </div>
                ) : undefined
              ) : group.id === "body" ? (
                <Sparkline points={weightSeries} label="體重趨勢（近 14 筆）" unit="kg" />
              ) : undefined
            }
          />
        ))}
        <div className="glass glass-lift rounded-[2rem] p-6">
          <h2 className="text-xl font-black">代謝估算</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="BMR 基礎代謝" value={bmr ? `${bmr} kcal` : "資料不足"} />
            <Metric label="TDEE 每日消耗" value={tdee ? `${tdee} kcal` : "資料不足"} />
          </div>
          <p className="mt-3 text-xs text-stone-400">
            使用 Mifflin-St Jeor 公式估算，需填寫性別、生日、身高、體重與活動量。{syncedWeight || syncedHeight ? "目前優先使用 Health Connect 同步的最新體重／身高。" : ""}
          </p>
        </div>
      </div>
    </>
  );
}
