import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, startOfLocalDay } from "@/lib/dates";
import { sumMeals } from "@/lib/totals";
import { MealCaptureForm } from "@/components/meal-capture-form";
import { LogoutButton } from "@/components/logout-button";
import { AiInfoCard } from "@/components/ai-info-card";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const start = startOfLocalDay(new Date());
  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: addDays(start, 1) } },
    include: { items: true },
    orderBy: { eatenAt: "desc" }
  });
  const totals = sumMeals(meals);
  const target = user.profile?.calorieTarget ?? 2000;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">AI Food Diary</p>
          <h1 className="mt-2 text-4xl font-black">今日飲食</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl">
          <p className="text-slate-300">今日攝取</p>
          <p className="mt-2 text-5xl font-black">{totals.calories} kcal</p>
          <p className="mt-2 text-sm text-slate-400">目標 {target} kcal</p>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min((totals.calories / target) * 100, 100)}%` }} />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <Macro label="蛋白質" value={`${totals.protein.toFixed(1)}g`} />
            <Macro label="脂肪" value={`${totals.fat.toFixed(1)}g`} />
            <Macro label="碳水" value={`${totals.carbs.toFixed(1)}g`} />
          </div>
        </div>
        <MealCaptureForm />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black">今日餐點</h2>
          <div className="mt-4 space-y-4">
            {meals.length === 0 ? <p className="text-slate-500">今天還沒有紀錄。</p> : null}
            {meals.map((meal) => (
              <article className="rounded-2xl border border-slate-100 p-4" key={meal.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{meal.mealType}</p>
                  <p className="text-sm text-slate-500">{meal.totalCalories} kcal</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {meal.items.map((item) => (
                    <li key={item.id}>{item.name} · {item.estimatedAmount} · {item.calories} kcal</li>
                  ))}
                </ul>
                {meal.aiNotes ? <p className="mt-3 text-xs text-slate-500">{meal.aiNotes}</p> : null}
              </article>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <AiInfoCard title="下一餐建議" endpoint="/api/recommendations/next-meal" type="advice" />
          <AiInfoCard title="昨日總結" endpoint="/api/daily-summary" type="summary" />
        </div>
      </section>
    </main>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-4"><p className="text-xl font-bold">{value}</p><p className="text-xs text-slate-300">{label}</p></div>;
}
