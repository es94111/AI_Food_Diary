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
import { WaterCard } from "@/components/water-card";
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
  // Remaining budget vs. the daily target (in week view this compares the daily
  // average against the daily target, so "剩餘" stays meaningful).
  const remainingCalories = target - displayTotals.calories;
  const isOverCalories = remainingCalories < 0;
  const consumedPercent = target > 0 ? Math.round((displayTotals.calories / target) * 100) : 0;
  const barPercent = Math.min(consumedPercent, 100);

  // Net calories = intake − measured total expenditure (Health Connect
  // TotalCaloriesBurned). Summed across the period; averaged per day in week
  // view so it lines up with the averaged intake. Only shown when there's
  // measured expenditure, since the whole point is the *actual* burn (vs. the
  // TDEE estimate the target card already uses).
  const expenditureRows = await prisma.healthMetric.findMany({
    where: { userId: user.id, type: "TOTAL_CALORIES", measuredAt: { gte: start, lt: end } },
    select: { value: true, encValue: true }
  });
  const expenditureTotal = expenditureRows.reduce((sum, row) => sum + decryptMetricValue(row), 0);
  const displayExpenditure = Math.round(view === "week" ? expenditureTotal / 7 : expenditureTotal);
  const hasExpenditure = displayExpenditure > 0;
  const netCalories = Math.round(displayTotals.calories) - displayExpenditure;
  const isDeficit = netCalories < 0;
  const mealList = meals.map((meal) => ({
    ...decryptMeal(meal),
    eatenAt: meal.eatenAt.toISOString(),
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

  // Water tracking is a daily habit metric, so the card only shows in day view.
  const waterLogs =
    view === "day"
      ? await prisma.waterLog.findMany({
          where: { userId: user.id, drankAt: { gte: start, lt: end } },
          orderBy: { drankAt: "desc" }
        })
      : [];
  const waterTotalMl = waterLogs.reduce((sum, log) => sum + log.amountMl, 0);
  const waterGoalMl = decProfile?.waterGoalMl ?? 2000;
  const waterLogsView = waterLogs.map((log) => ({
    id: log.id,
    amountMl: log.amountMl,
    drankAt: log.drankAt.toISOString()
  }));

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
          <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm text-stone-500">每日目標 {target} kcal · {consumedPercent}%</p>
            <p className={`text-sm font-bold ${isOverCalories ? "text-rose-300" : "text-amber-200"}`}>
              {isOverCalories ? `超標 +${Math.abs(remainingCalories)} kcal` : `剩餘 ${remainingCalories} kcal`}
            </p>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isOverCalories ? "bg-gradient-to-r from-rose-600 to-rose-400" : "bg-gradient-to-r from-amber-500 to-amber-300"}`}
              style={{ width: `${barPercent}%` }}
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
        {hasExpenditure ? (
          <div className="glass glass-lift rounded-[2rem] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-stone-500">{view === "week" ? "本週平均淨熱量" : "當日淨熱量"}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${isDeficit ? "bg-emerald-100 text-emerald-700" : netCalories > 0 ? "bg-rose-100 text-rose-700" : "bg-stone-100 text-stone-600"}`}>
                {isDeficit ? "熱量赤字" : netCalories > 0 ? "熱量盈餘" : "持平"}
              </span>
            </div>
            <div className="mt-1 flex items-end gap-2">
              <p className={`text-5xl font-black tracking-tight ${isDeficit ? "text-emerald-600" : netCalories > 0 ? "text-rose-600" : "text-stone-700"}`}>
                {netCalories > 0 ? `+${netCalories}` : netCalories}
              </p>
              <p className="mb-1.5 text-lg font-semibold text-stone-400">kcal</p>
            </div>
            <p className="mt-2 text-sm text-stone-500">攝取 {Math.round(displayTotals.calories)} − 實測總消耗 {displayExpenditure} kcal</p>
            <p className="mt-1 text-xs text-stone-400">
              總消耗為 Health Connect 同步的實測值（基礎＋活動）。{isDeficit ? "赤字傾向減重。" : netCalories > 0 ? "盈餘傾向增重。" : ""}
            </p>
          </div>
        ) : null}
        {view === "day" ? (
          <WaterCard
            key={selectedDateStr}
            dateStr={selectedDateStr}
            tz={tzName(tz)}
            goalMl={waterGoalMl}
            initialLogs={waterLogsView}
            initialTotalMl={waterTotalMl}
            isToday={isTodayView}
          />
        ) : null}
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
