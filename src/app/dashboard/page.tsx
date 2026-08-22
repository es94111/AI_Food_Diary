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
import { DailySummaryPopup } from "@/components/daily-summary-popup";
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
  // Only let a synced reading override the profile when it's a positive number.
  // A 0 (e.g. a value that failed to decrypt) must not zero out weight/height,
  // or calculateBmr returns null and the card shows "資料不足".
  const effectiveProfile = decProfile
    ? {
        ...decProfile,
        weightKg: syncedWeight && syncedWeight > 0 ? syncedWeight : decProfile.weightKg,
        heightCm: syncedHeight && syncedHeight > 0 ? syncedHeight : decProfile.heightCm
      }
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
  const expenditureTotal = expenditureRows.reduce((sum, row) => sum + (decryptMetricValue(row) ?? 0), 0);
  const displayExpenditure = Math.round(view === "week" ? expenditureTotal / 7 : expenditureTotal);
  const hasExpenditure = displayExpenditure > 0;
  const netCalories = Math.round(displayTotals.calories) - displayExpenditure;
  const isDeficit = netCalories < 0;
  const mealList = meals.map((meal) => {
    const decrypted = decryptMeal(meal);
    const imageUrls = Array.from(
      { length: decrypted.imageCount },
      (_, i) => `/api/meals/${meal.id}/image?i=${i}`
    );
    return {
      ...decrypted,
      eatenAt: meal.eatenAt.toISOString(),
      imageStorageKey: imageUrls[0] ?? null,
      imageUrls
    };
  });
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
      imageCount: dayMeals.filter((meal) => meal.imageStorageKeys.length > 0 || !!meal.imageStorageKey).length
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
  const mealRhythm = mealList.map((meal) => ({
    id: meal.id,
    mealType: meal.mealType,
    eatenAt: meal.eatenAt,
    calories: meal.totalCalories,
    itemCount: meal.items.length
  }));

  return (
    <>
      <DailySummaryPopup />
      <div className="dashboard-page">
        <header className="dashboard-page-header">
          <div>
            <p className="dashboard-eyebrow">{view === "week" ? "週期回顧 / NUTRITION REVIEW" : "今日工作台 / DAILY DESK"}</p>
            <h1>{view === "week" ? "星期飲食" : "每日飲食"}</h1>
            <p className="dashboard-page-description">把每一餐留下來，先理解，再決定下一步。</p>
          </div>
          <div className="dashboard-page-actions">
            <DateRangeSwitcher date={selectedDateStr} view={view} />
            <a className="dashboard-primary-action" href="#capture"><span aria-hidden="true">+</span>記錄飲食</a>
          </div>
        </header>

        <section className="dashboard-overview-grid" aria-label="飲食摘要">
          <article className="nutrition-hero-card">
            <div className="nutrition-hero-topline">
              <div>
                <p className="dashboard-eyebrow dashboard-eyebrow-light">{view === "week" ? "本週平均攝取" : "今日攝取"}</p>
                <p className="nutrition-hero-date">{title}</p>
              </div>
              <span className="nutrition-hero-index">{isTodayView ? "LIVE" : view === "week" ? "7 DAYS" : "ARCHIVE"}</span>
            </div>
            <div className="nutrition-hero-number"><strong>{Math.round(displayTotals.calories)}</strong><span>kcal</span></div>
            <div className="nutrition-hero-target-row">
              <span>每日目標 <strong>{target} kcal</strong></span>
              <span className={isOverCalories ? "nutrition-over" : "nutrition-remaining"}>{isOverCalories ? `超出 ${Math.abs(remainingCalories)} kcal` : `還有 ${remainingCalories} kcal`}</span>
            </div>
            <div className="nutrition-progress" aria-label={`已記錄 ${consumedPercent}% 的每日目標`}><span style={{ width: `${barPercent}%` }} /></div>
            <div className="nutrition-hero-bottom">
              <div className="nutrition-donut-wrap">{macroTotal > 0 ? <MacroDonut protein={proteinPercent} fat={fatPercent} carbs={carbsPercent} /> : <span className="nutrition-donut-empty">尚無<br />營養比例</span>}</div>
              <div className="nutrition-macro-grid">
                <Macro dot="#7fb7d6" label={`蛋白質 ${proteinPercent}%`} value={`${displayTotals.protein.toFixed(1)}g`} />
                <Macro dot="#e6a34a" label={`脂肪 ${fatPercent}%`} value={`${displayTotals.fat.toFixed(1)}g`} />
                <Macro dot="#d97869" label={`碳水 ${carbsPercent}%`} value={`${displayTotals.carbs.toFixed(1)}g`} />
              </div>
            </div>
          </article>

          <article className="dashboard-pulse-card">
            <div className="dashboard-section-heading">
              <div><p className="dashboard-eyebrow">QUICK READ</p><h2>今天的節奏</h2></div>
              <span className="dashboard-count-badge">{mealList.length} 餐</span>
            </div>
            <div className="pulse-metrics">
              <div><span>飲食紀錄</span><strong>{mealList.length}</strong><small>{mealList.length ? "持續累積中" : "等待第一筆"}</small></div>
              <div><span>飲水進度</span><strong>{view === "day" ? `${Math.round(waterTotalMl / 100) / 10} L` : "—"}</strong><small>{view === "day" ? `目標 ${Math.round(waterGoalMl / 100) / 10} L` : "日檢視可查看"}</small></div>
              <div><span>待確認</span><strong className="pulse-accent">0</strong><small>目前沒有草稿</small></div>
            </div>
            <div className="pulse-note"><span className="pulse-note-mark" aria-hidden="true">↗</span><p>{mealList.length ? `你已經記下 ${mealList.length} 個餐點，繼續保持這個節奏。` : "從一個餐點開始，今天的資料會慢慢成形。"}</p></div>
          </article>
        </section>

        <div className="dashboard-workspace-grid">
          <section className="dashboard-main-stack" aria-label="餐點紀錄">
            <div className="dashboard-section-heading dashboard-section-heading-large">
              <div><p className="dashboard-eyebrow">MEAL RHYTHM</p><h2>{view === "week" ? "本週餐點" : "餐點節奏線"}</h2></div>
              <span className="dashboard-section-meta">{view === "week" ? "每日平均" : `${mealList.length} 筆紀錄`}</span>
            </div>
            <MealRhythmRail meals={mealRhythm} timeZone={tzName(tz)} />
            {hasExpenditure ? (
              <div className="net-calorie-panel">
                <div><p className="dashboard-eyebrow">ENERGY BALANCE</p><h3>{view === "week" ? "本週平均淨熱量" : "今日淨熱量"}</h3></div>
                <div className="net-calorie-number"><strong>{netCalories > 0 ? `+${netCalories}` : netCalories}</strong><span>kcal</span></div>
                <div className="net-calorie-detail"><span className={isDeficit ? "status-olive" : "status-terracotta"}>{isDeficit ? "熱量赤字" : netCalories > 0 ? "熱量盈餘" : "持平"}</span><p>攝取 {Math.round(displayTotals.calories)} − 實測總消耗 {displayExpenditure} kcal</p></div>
              </div>
            ) : null}
            <div className="meal-list-panel">
              <div className="meal-list-panel-heading"><div><p className="dashboard-eyebrow">LOGGED ENTRIES</p><h3>{view === "week" ? "本週的飲食紀錄" : "今天已記錄"}</h3></div><span>{mealList.length.toString().padStart(2, "0")}</span></div>
              <MealList meals={mealList} timeZone={tzName(tz)} />
            </div>
            {view === "week" ? <WeeklyNutritionReview days={weeklyDays} /> : null}
          </section>

          <aside className="dashboard-side-stack">
            <MealCaptureForm initialNextMealAdvice={isTodayView ? todayRecommendation?.advice ?? "" : ""} timeZone={tzName(tz)} />
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
            <AiInfoCard
              title="今日總結"
              endpoint={`/api/daily-summary?date=${selectedDateStr}&tz=${encodeURIComponent(tzName(tz))}`}
              type="summary"
              canGenerate={canGenerateDailySummary}
              blockedMessage="今日總結需等今天結束後才能產生。"
            />
          </aside>
        </div>
      </div>
    </>
  );
}

type RhythmMeal = { id: string; mealType: string; eatenAt: string; calories: number; itemCount: number };

function MealRhythmRail({ meals, timeZone }: { meals: RhythmMeal[]; timeZone: string }) {
  const orderedMeals = [...meals].sort((a, b) => Date.parse(a.eatenAt) - Date.parse(b.eatenAt));
  if (orderedMeals.length === 0) {
    return <div className="meal-rhythm-rail is-empty"><span className="meal-rhythm-empty-line" aria-hidden="true" /><p>還沒有餐點節點。記錄後，今天的節奏會出現在這裡。</p></div>;
  }

  return (
    <div className="meal-rhythm-rail">
      <div className="meal-rhythm-scale" aria-hidden="true"><span>06:00</span><span>12:00</span><span>18:00</span><span>00:00</span></div>
      <div className="meal-rhythm-track" aria-hidden="true"><span /><i /><i /><i /><i /></div>
      <div className="meal-rhythm-events" aria-label="餐點時間節奏">
        {orderedMeals.map((meal) => (
          <div className="meal-rhythm-event" key={meal.id}>
            <span className="meal-rhythm-node" aria-hidden="true" />
            <time dateTime={meal.eatenAt}>{formatRhythmTime(meal.eatenAt, timeZone)}</time>
            <strong>{mealTypeLabel(meal.mealType)}</strong>
            <small>{meal.calories} kcal · {meal.itemCount} 項</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRhythmTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-TW", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

function mealTypeLabel(type: string) {
  return ({ BREAKFAST: "早餐", LUNCH: "午餐", DINNER: "晚餐", SNACK: "點心" } as Record<string, string>)[type] ?? type;
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
