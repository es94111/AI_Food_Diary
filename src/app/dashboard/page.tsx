import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDaysStr, dayRangeUtc, dayStartUtc, normalizeDateStr, todayStr, weekRangeUtc, weekStartStr } from "@/lib/dates";
import { resolveUserTz, tzName, TZ_COOKIE } from "@/lib/timezone";
import { sumMeals } from "@/lib/totals";
import { decryptProfile } from "@/lib/profile-crypto";
import { decryptMetricValue } from "@/lib/field-crypto";
import { decryptMeal } from "@/lib/b2-crypto";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { MealCaptureForm } from "@/components/meal-capture-form";
import { AiInfoCard } from "@/components/ai-info-card";
import { MealList } from "@/components/meal-list";
import { DateRangeSwitcher } from "@/components/date-range-switcher";
import { WeeklyNutritionReview } from "@/components/weekly-nutrition-review";

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const decProfile = decryptProfile(user.profile);
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

  // The calorie target tracks the latest Health Connect weight/height when
  // synced; fetch just those two metrics rather than the whole health set.
  const [latestWeight, latestHeight] = await Promise.all([
    prisma.healthMetric.findFirst({
      where: { userId: user.id, type: "WEIGHT", unit: "kg" },
      orderBy: { measuredAt: "desc" },
      select: { value: true, encValue: true }
    }),
    prisma.healthMetric.findFirst({
      where: { userId: user.id, type: "HEIGHT", unit: "cm" },
      orderBy: { measuredAt: "desc" },
      select: { value: true, encValue: true }
    })
  ]);
  const syncedWeight = latestWeight ? decryptMetricValue(latestWeight) : null;
  const syncedHeight = latestHeight ? decryptMetricValue(latestHeight) : null;
  const effectiveProfile = decProfile
    ? { ...decProfile, weightKg: syncedWeight ?? decProfile.weightKg, heightCm: syncedHeight ?? decProfile.heightCm }
    : null;
  const bmr = calculateBmr(effectiveProfile);
  const tdee = calculateTdee(bmr, effectiveProfile?.activityLevel);
  const target = calorieTargetFromGoal(tdee, effectiveProfile?.goal) ?? decProfile?.calorieTarget ?? 2000;

  const totals = sumMeals(meals);
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
  const mealList = meals.map((meal) => ({
    ...decryptMeal(meal),
    imageStorageKey: meal.imageStorageKey ? `/api/meals/${meal.id}/image` : null
  }));
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

  return (
    <>
      <header className="mt-6">
        <h1 className="text-4xl font-black tracking-tight">{view === "week" ? "星期飲食" : "每日飲食"}</h1>
        <p className="mt-1 text-sm text-stone-500">{title}</p>
      </header>

      <div className="mt-6 space-y-6">
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
          <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row">
            {macroTotal > 0 ? <MacroDonut protein={proteinPercent} fat={fatPercent} carbs={carbsPercent} /> : null}
            <div className="grid w-full flex-1 grid-cols-3 gap-2.5 text-center">
              <Macro dot="#fbbf24" label={`蛋白質 ${proteinPercent}%`} value={`${displayTotals.protein.toFixed(1)}g`} />
              <Macro dot="#fb7185" label={`脂肪 ${fatPercent}%`} value={`${displayTotals.fat.toFixed(1)}g`} />
              <Macro dot="#38bdf8" label={`碳水 ${carbsPercent}%`} value={`${displayTotals.carbs.toFixed(1)}g`} />
            </div>
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
      </div>
    </>
  );
}

function Macro({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
      <p className="text-lg font-black">{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-stone-300">
        {dot ? <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </p>
    </div>
  );
}

// Donut for the day's macro split. A radial mask punches a transparent hole so
// the dark card shows through (no fixed centre colour to keep in sync).
function MacroDonut({ protein, fat, carbs }: { protein: number; fat: number; carbs: number }) {
  const pf = protein + fat;
  const gradient = `conic-gradient(#fbbf24 0 ${protein}%, #fb7185 ${protein}% ${pf}%, #38bdf8 ${pf}% 100%)`;
  const hole = "radial-gradient(circle at center, transparent 54%, #000 55%)";
  return (
    <div className="relative h-24 w-24 shrink-0">
      <div className="h-full w-full rounded-full" style={{ background: gradient, mask: hole, WebkitMask: hole }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-[10px] font-medium text-stone-400">三大營養</span>
        <span className="text-xs font-bold text-white">佔比</span>
      </div>
    </div>
  );
}
