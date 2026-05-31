import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDaysStr, dayRangeUtc, dayStartUtc, normalizeDateStr, todayStr, weekRangeUtc, weekStartStr } from "@/lib/dates";
import { resolveUserTz, tzName, TZ_COOKIE } from "@/lib/timezone";
import { TimezoneReporter } from "@/components/timezone-reporter";
import { sumMeals } from "@/lib/totals";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { MealCaptureForm } from "@/components/meal-capture-form";
import { AiInfoCard } from "@/components/ai-info-card";
import { MealList } from "@/components/meal-list";
import { DateRangeSwitcher } from "@/components/date-range-switcher";
import { WeeklyNutritionReview } from "@/components/weekly-nutrition-review";
import { AdminPanel } from "@/components/admin-panel";
import { HealthConnectionsPanel } from "@/components/health-connections-panel";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { ProfileMetabolismForm } from "@/components/profile-metabolism-form";
import { LogoutButton } from "@/components/logout-button";
import { GoogleLinkPanel } from "@/components/google-link-panel";
import { WEB_VERSION } from "@/lib/version";
import { getLatestAppRelease } from "@/lib/app-release";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const cookieStore = await cookies();
  const tz = resolveUserTz(cookieStore.get(TZ_COOKIE)?.value, user.profile?.timezone);
  const todayStrValue = todayStr(tz);
  const selectedDateStr = normalizeDateStr(params.date, tz);
  const view = params.view === "week" ? "week" : "day";

  const { start, end } = view === "week" ? weekRangeUtc(selectedDateStr, tz) : dayRangeUtc(selectedDateStr, tz);
  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } },
    include: { items: true },
    orderBy: { eatenAt: "desc" }
  });
  const todayRecommendation = await prisma.dailyRecommendation.findUnique({
    where: { userId_recommendationDate: { userId: user.id, recommendationDate: dayStartUtc(todayStrValue, tz) } }
  });
  const healthMetrics = await prisma.healthMetric.findMany({
    where: { userId: user.id },
    orderBy: { measuredAt: "desc" },
    take: 100
  });
  const latestHealthMetrics = latestMetricsByType(healthMetrics);
  const totals = sumMeals(meals);
  const syncedWeight = latestHealthMetrics.WEIGHT?.unit.toLowerCase() === "kg" ? latestHealthMetrics.WEIGHT.value : null;
  const syncedHeight = latestHealthMetrics.HEIGHT?.unit.toLowerCase() === "cm" ? latestHealthMetrics.HEIGHT.value : null;
  const effectiveProfile = user.profile
    ? { ...user.profile, weightKg: syncedWeight ?? user.profile.weightKg, heightCm: syncedHeight ?? user.profile.heightCm }
    : null;
  const bmr = calculateBmr(effectiveProfile);
  const tdee = calculateTdee(bmr, effectiveProfile?.activityLevel);
  // Auto-derive the target from the (synced) TDEE so it updates with Health
  // Connect data; fall back to the stored target only when TDEE is unknown.
  const target = calorieTargetFromGoal(tdee, effectiveProfile?.goal) ?? user.profile?.calorieTarget ?? 2000;
  const isTodayView = view === "day" && selectedDateStr === todayStrValue;
  const canGenerateDailySummary = selectedDateStr < todayStrValue;
  const displayTotals =
    view === "week"
      ? { calories: Math.round(totals.calories / 7), protein: totals.protein / 7, fat: totals.fat / 7, carbs: totals.carbs / 7 }
      : totals;
  const macroTotal = displayTotals.protein + displayTotals.fat + displayTotals.carbs;
  const proteinPercent = macroTotal ? Math.round((displayTotals.protein / macroTotal) * 100) : 0;
  const fatPercent = macroTotal ? Math.round((displayTotals.fat / macroTotal) * 100) : 0;
  const carbsPercent = macroTotal ? Math.round((displayTotals.carbs / macroTotal) * 100) : 0;
  const mealList = await Promise.all(
    meals.map(async (meal) => ({
      ...meal,
      totalProtein: Number(meal.totalProtein),
      totalFat: Number(meal.totalFat),
      totalCarbs: Number(meal.totalCarbs),
      imageStorageKey: meal.imageStorageKey ? `/api/meals/${meal.id}/image` : null,
      items: meal.items.map((item) => ({
        ...item,
        protein: Number(item.protein),
        fat: Number(item.fat),
        carbs: Number(item.carbs)
      }))
    }))
  );
  const profile = user.profile
    ? {
        gender: user.profile.gender,
        birthDate: user.profile.birthDate?.toISOString() ?? null,
        heightCm: user.profile.heightCm,
        weightKg: user.profile.weightKg ? Number(user.profile.weightKg) : null,
        activityLevel: user.profile.activityLevel,
        goal: user.profile.goal,
        calorieTarget: user.profile.calorieTarget
      }
    : null;
  const weekStartStrValue = weekStartStr(selectedDateStr);
  const weeklyDays = Array.from({ length: 7 }, (_, index) => {
    const dayStr = addDaysStr(weekStartStrValue, index);
    const { start: dayStart, end: dayEnd } = dayRangeUtc(dayStr, tz);
    const dayMeals = meals.filter((meal) => meal.eatenAt >= dayStart && meal.eatenAt < dayEnd);
    const dayTotals = sumMeals(dayMeals);
    return {
      date: dayStr,
      calories: dayTotals.calories,
      protein: dayTotals.protein,
      fat: dayTotals.fat,
      carbs: dayTotals.carbs,
      imageCount: dayMeals.filter((meal) => meal.imageStorageKey).length
    };
  });
  const title = view === "week" ? `${weekStartStrValue} — ${addDaysStr(weekStartStrValue, 6)}` : selectedDateStr;
  const appConfig = user.isAdmin
    ? await prisma.appConfig.findUnique({ where: { id: "singleton" } })
    : null;
  const appRelease = await getLatestAppRelease();

  const foodPanel = (
    <>
      <DateRangeSwitcher date={selectedDateStr} view={view} />
      <div className="glass-dark iridescent rounded-[2rem] p-6 text-white">
        <p className="text-sm font-medium text-stone-400">{view === "week" ? "本週平均攝取" : "當日攝取"}</p>
        <div className="mt-1 flex items-end gap-2">
          <p className="text-5xl font-black tracking-tight">{displayTotals.calories}</p>
          <p className="mb-1.5 text-lg font-semibold text-stone-400">kcal</p>
        </div>
        <p className="mt-0.5 text-sm text-stone-500">每日目標 {target} kcal · {Math.min(Math.round((displayTotals.calories / target) * 100), 100)}%</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
            style={{ width: `${Math.min((displayTotals.calories / target) * 100, 100)}%` }}
          />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
          <Macro label={`蛋白質 ${proteinPercent}%`} value={`${displayTotals.protein.toFixed(1)}g`} />
          <Macro label={`脂肪 ${fatPercent}%`} value={`${displayTotals.fat.toFixed(1)}g`} />
          <Macro label={`碳水 ${carbsPercent}%`} value={`${displayTotals.carbs.toFixed(1)}g`} />
        </div>
      </div>
      <MealCaptureForm initialNextMealAdvice={isTodayView ? todayRecommendation?.advice ?? "" : ""} />
      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">{view === "week" ? "本週餐點" : "當日餐點"}</h2>
        <div className="mt-4">
          <MealList meals={mealList} />
        </div>
      </div>
      {view === "week" ? <WeeklyNutritionReview days={weeklyDays} /> : null}
      <AiInfoCard
        title="今日總結"
        endpoint={`/api/daily-summary?date=${selectedDateStr}&tz=${encodeURIComponent(tzName(tz))}`}
        type="summary"
        canGenerate={canGenerateDailySummary}
        blockedMessage="今日總結需等今天結束後才能產生。"
      />
    </>
  );

  const healthPanel = (
    <>
      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">健康同步</h2>
        <p className="mt-1 text-xs text-stone-500">Flutter Android app 可透過 Health Connect 同步步數、熱量、睡眠、運動、心率、體脂等資料。</p>
        <HealthConnectionsPanel />
      </div>
      {HEALTH_GROUPS.map((group) => (
        <HealthGroupCard key={group.title} group={group} metrics={latestHealthMetrics} />
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
    </>
  );

  const settingsPanel = (
    <>
      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">使用者設定</h2>
        <p className="mt-1 text-sm text-stone-500">{user.email}</p>
        <div className="mt-5">
          <ProfileMetabolismForm profile={profile} />
        </div>
      </div>
      <GoogleLinkPanel clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} linked={!!user.googleId} />
      {user.isAdmin && <AdminPanel registrationOpen={appConfig?.registrationOpen ?? true} />}
      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">版本資訊</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="最新版本" value={appRelease.version ? `v${appRelease.version}` : "—"} />
          <Metric label="目前版本" value={`v${WEB_VERSION}`} />
        </div>
        {appRelease.notes ? (
          <p className="mt-3 whitespace-pre-line text-xs text-stone-500">{appRelease.notes}</p>
        ) : null}
        {appRelease.apkKey ? (
          <a
            href="/api/app/download"
            className="mt-4 inline-block rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
          >
            下載 Android App (v{appRelease.version})
          </a>
        ) : null}
      </div>
      <div>
        <LogoutButton />
      </div>
    </>
  );

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-6">
      <TimezoneReporter serverTimezone={user.profile?.timezone ?? ""} />
      <header>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm2.023 6.828a.75.75 0 1 0-1.06-1.06 3.75 3.75 0 0 1-5.304 0 .75.75 0 0 0-1.06 1.06 5.25 5.25 0 0 0 7.424 0Z" clipRule="evenodd" />
            </svg>
          </span>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">AI Food Diary</p>
        </div>
        <h1 className="mt-2 text-4xl font-black tracking-tight">{view === "week" ? "星期飲食" : "每日飲食"}</h1>
        <p className="mt-1 text-sm text-stone-500">{title}</p>
      </header>

      <DashboardTabs food={foodPanel} health={healthPanel} settings={settingsPanel} />
    </main>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
      <p className="text-lg font-black">{value}</p>
      <p className="mt-0.5 text-xs text-stone-300">{label}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.6)", backdropFilter: "blur(8px)" }}>
      <p className="text-xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-stone-500">{label}</p>
    </div>
  );
}

function latestMetricsByType(metrics: Array<{ type: string; value: number; unit: string; measuredAt: Date }>) {
  return metrics.reduce<Record<string, { value: number; unit: string; measuredAt: Date }>>((latest, metric) => {
    if (!latest[metric.type]) latest[metric.type] = metric;
    return latest;
  }, {});
}

function formatHealthMetric(metric: { value: number; unit: string } | undefined, digits: number) {
  if (!metric) return "尚未同步";
  return `${metric.value.toFixed(digits)} ${metric.unit}`;
}

// Sleep durations (stored in minutes) read better as H:MM.
function formatSleep(metric: { value: number } | undefined) {
  if (!metric) return "尚未同步";
  const total = Math.round(metric.value);
  const h = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// ---- Health metrics, grouped by category for the infographic layout ----

type HealthMetricDef = { type: string; label: string; emoji: string; digits?: number; sleep?: boolean };
type HealthAccent = "amber" | "sky" | "rose" | "indigo" | "emerald";
type HealthGroup = { title: string; emoji: string; accent: HealthAccent; metrics: HealthMetricDef[] };

// Static class strings so Tailwind's JIT keeps them.
const HEALTH_ACCENTS: Record<HealthAccent, { badge: string; tile: string; value: string }> = {
  amber: { badge: "bg-amber-100 text-amber-700", tile: "bg-amber-50/70", value: "text-amber-900" },
  sky: { badge: "bg-sky-100 text-sky-700", tile: "bg-sky-50/70", value: "text-sky-900" },
  rose: { badge: "bg-rose-100 text-rose-700", tile: "bg-rose-50/70", value: "text-rose-900" },
  indigo: { badge: "bg-indigo-100 text-indigo-700", tile: "bg-indigo-50/70", value: "text-indigo-900" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", tile: "bg-emerald-50/70", value: "text-emerald-900" }
};

const HEALTH_GROUPS: HealthGroup[] = [
  {
    title: "活動與能量",
    emoji: "🏃",
    accent: "amber",
    metrics: [
      { type: "STEPS", label: "步數", emoji: "👣", digits: 0 },
      { type: "DISTANCE", label: "距離", emoji: "📏", digits: 0 },
      { type: "SPEED", label: "速度", emoji: "⚡", digits: 1 },
      { type: "FLIGHTS_CLIMBED", label: "爬樓層", emoji: "🪜", digits: 0 },
      { type: "ACTIVITY_INTENSITY", label: "活動強度", emoji: "⏱️", digits: 0 },
      { type: "ACTIVE_CALORIES", label: "活動熱量", emoji: "🔥", digits: 0 },
      { type: "BASAL_CALORIES", label: "基礎消耗", emoji: "🌡️", digits: 0 },
      { type: "TOTAL_CALORIES", label: "每日總消耗", emoji: "⚡", digits: 0 },
      { type: "EXERCISE", label: "運動", emoji: "🏋️", digits: 0 }
    ]
  },
  {
    title: "身體組成",
    emoji: "🧍",
    accent: "sky",
    metrics: [
      { type: "WEIGHT", label: "體重", emoji: "⚖️", digits: 1 },
      { type: "HEIGHT", label: "身高", emoji: "📐", digits: 0 },
      { type: "BMI", label: "BMI", emoji: "🧮", digits: 1 },
      { type: "BODY_FAT", label: "體脂率", emoji: "📊", digits: 1 },
      { type: "LEAN_BODY_MASS", label: "瘦體重", emoji: "💪", digits: 1 },
      { type: "BODY_WATER_MASS", label: "體水分", emoji: "💧", digits: 1 },
      { type: "BODY_TEMPERATURE", label: "體溫", emoji: "🌡️", digits: 1 },
      { type: "SKIN_TEMPERATURE", label: "皮膚溫度", emoji: "🌡️", digits: 1 }
    ]
  },
  {
    title: "生命徵象",
    emoji: "❤️",
    accent: "rose",
    metrics: [
      { type: "HEART_RATE", label: "心率", emoji: "❤️", digits: 0 },
      { type: "RESTING_HEART_RATE", label: "靜息心率", emoji: "💗", digits: 0 },
      { type: "HRV", label: "HRV", emoji: "📈", digits: 0 },
      { type: "RESPIRATORY_RATE", label: "呼吸率", emoji: "🫁", digits: 0 },
      { type: "BLOOD_OXYGEN", label: "血氧", emoji: "🩸", digits: 0 },
      { type: "BLOOD_PRESSURE_SYSTOLIC", label: "收縮壓", emoji: "🩺", digits: 0 },
      { type: "BLOOD_PRESSURE_DIASTOLIC", label: "舒張壓", emoji: "🩺", digits: 0 },
      { type: "BLOOD_GLUCOSE", label: "血糖", emoji: "🍬", digits: 0 }
    ]
  },
  {
    title: "睡眠",
    emoji: "🌙",
    accent: "indigo",
    metrics: [
      { type: "SLEEP", label: "睡眠", emoji: "😴", sleep: true },
      { type: "SLEEP_DEEP", label: "深睡", emoji: "🌑", sleep: true },
      { type: "SLEEP_LIGHT", label: "淺睡", emoji: "🌙", sleep: true },
      { type: "SLEEP_REM", label: "REM", emoji: "💤", sleep: true },
      { type: "SLEEP_AWAKE", label: "清醒", emoji: "☀️", sleep: true }
    ]
  },
  {
    title: "飲食與水分",
    emoji: "🍽️",
    accent: "emerald",
    metrics: [
      { type: "WATER", label: "喝水", emoji: "🥤", digits: 1 },
      { type: "NUTRITION", label: "營養攝取", emoji: "🍽️", digits: 0 }
    ]
  }
];

function HealthGroupCard({
  group,
  metrics
}: {
  group: HealthGroup;
  metrics: Record<string, { value: number; unit: string } | undefined>;
}) {
  const accent = HEALTH_ACCENTS[group.accent];
  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-lg ${accent.badge}`}>{group.emoji}</span>
        <h3 className="text-lg font-black">{group.title}</h3>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {group.metrics.map((m) => (
          <div className={`rounded-2xl p-3 ${accent.tile}`} key={m.type}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{m.emoji}</span>
              <p className="text-xs text-stone-500">{m.label}</p>
            </div>
            <p className={`mt-1 text-lg font-black ${accent.value}`}>
              {m.sleep ? formatSleep(metrics[m.type]) : formatHealthMetric(metrics[m.type], m.digits ?? 0)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
