import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, isoDate, parseLocalDate, startOfLocalDay, startOfLocalWeek } from "@/lib/dates";
import { sumMeals } from "@/lib/totals";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { MealCaptureForm } from "@/components/meal-capture-form";
import { UserHeaderActions } from "@/components/user-header-actions";
import { AiInfoCard } from "@/components/ai-info-card";
import { MealList } from "@/components/meal-list";
import { DateRangeSwitcher } from "@/components/date-range-switcher";
import { WeeklyNutritionReview } from "@/components/weekly-nutrition-review";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const selectedDate = parseLocalDate(params.date);
  const view = params.view === "week" ? "week" : "day";

  const start = view === "week" ? startOfLocalWeek(selectedDate) : startOfLocalDay(selectedDate);
  const end = addDays(start, view === "week" ? 7 : 1);
  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } },
    include: { items: true },
    orderBy: { eatenAt: "desc" }
  });
  const todayRecommendation = await prisma.dailyRecommendation.findUnique({
    where: { userId_recommendationDate: { userId: user.id, recommendationDate: startOfLocalDay(new Date()) } }
  });
  const totals = sumMeals(meals);
  const bmr = calculateBmr(user.profile ?? null);
  const tdee = calculateTdee(bmr, user.profile?.activityLevel);
  const target = user.profile?.calorieTarget ?? calorieTargetFromGoal(tdee, user.profile?.goal) ?? 2000;
  const macroTotal = totals.protein + totals.fat + totals.carbs;
  const proteinPercent = macroTotal ? Math.round((totals.protein / macroTotal) * 100) : 0;
  const fatPercent = macroTotal ? Math.round((totals.fat / macroTotal) * 100) : 0;
  const carbsPercent = macroTotal ? Math.round((totals.carbs / macroTotal) * 100) : 0;
  const mealList = meals.map((meal) => ({
    ...meal,
    totalProtein: Number(meal.totalProtein),
    totalFat: Number(meal.totalFat),
    totalCarbs: Number(meal.totalCarbs),
    items: meal.items.map((item) => ({
      ...item,
      protein: Number(item.protein),
      fat: Number(item.fat),
      carbs: Number(item.carbs)
    }))
  }));
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
  const weeklyDays = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const dayMeals = meals.filter((meal) => meal.eatenAt >= dayStart && meal.eatenAt < dayEnd);
    const dayTotals = sumMeals(dayMeals);
    return {
      date: isoDate(dayStart),
      calories: dayTotals.calories,
      protein: dayTotals.protein,
      fat: dayTotals.fat,
      carbs: dayTotals.carbs,
      imageCount: dayMeals.filter((meal) => meal.imageStorageKey).length
    };
  });
  const title = view === "week" ? `${isoDate(start)} — ${isoDate(addDays(end, -1))}` : isoDate(start);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm2.023 6.828a.75.75 0 1 0-1.06-1.06 3.75 3.75 0 0 1-5.304 0 .75.75 0 0 0-1.06 1.06 5.25 5.25 0 0 0 7.424 0Z" clipRule="evenodd" />
              </svg>
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-600">AI Food Diary</p>
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight">{view === "week" ? "星期飲食" : "每日飲食"}</h1>
          <p className="mt-1 text-sm text-slate-500">{title}</p>
        </div>
        <UserHeaderActions profile={profile} />
      </header>

      <DateRangeSwitcher date={isoDate(selectedDate)} view={view} />

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white shadow-xl">
            <p className="text-sm font-medium text-slate-400">{view === "week" ? "本週攝取" : "當日攝取"}</p>
            <div className="mt-1 flex items-end gap-2">
              <p className="text-5xl font-black tracking-tight">{totals.calories}</p>
              <p className="mb-1.5 text-lg font-semibold text-slate-400">kcal</p>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">目標 {target} kcal · {Math.min(Math.round((totals.calories / target) * 100), 100)}%</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-700"
                style={{ width: `${Math.min((totals.calories / target) * 100, 100)}%` }}
              />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <Macro label={`蛋白質 ${proteinPercent}%`} value={`${totals.protein.toFixed(1)}g`} />
              <Macro label={`脂肪 ${fatPercent}%`} value={`${totals.fat.toFixed(1)}g`} />
              <Macro label={`碳水 ${carbsPercent}%`} value={`${totals.carbs.toFixed(1)}g`} />
            </div>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-xl font-black">代謝估算</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="BMR 基礎代謝" value={bmr ? `${bmr} kcal` : "資料不足"} />
              <Metric label="TDEE 每日消耗" value={tdee ? `${tdee} kcal` : "資料不足"} />
            </div>
            <p className="mt-3 text-xs text-slate-400">使用 Mifflin-St Jeor 公式估算，需填寫性別、生日、身高、體重與活動量。</p>
          </div>
        </div>
        <MealCaptureForm initialNextMealAdvice={todayRecommendation?.advice ?? ""} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h2 className="text-xl font-black">{view === "week" ? "本週餐點" : "當日餐點"}</h2>
          <div className="mt-4">
            <MealList meals={mealList} />
          </div>
        </div>
        <div className="space-y-6">
          {view === "week" ? <WeeklyNutritionReview days={weeklyDays} /> : null}
          <AiInfoCard title="今日總結" endpoint={`/api/daily-summary?date=${isoDate(selectedDate)}`} type="summary" />
        </div>
      </section>
    </main>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3.5">
      <p className="text-lg font-black">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{label}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}
