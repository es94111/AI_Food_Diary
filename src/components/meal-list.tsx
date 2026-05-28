"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type MealItem = {
  id: string;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number | string;
  fat: number | string;
  carbs: number | string;
};

type Meal = {
  id: string;
  mealType: string;
  imageStorageKey: string | null;
  totalCalories: number;
  totalProtein: number | string;
  totalFat: number | string;
  totalCarbs: number | string;
  aiNotes: string | null;
  items: MealItem[];
};

export function MealList({ meals }: { meals: Meal[] }) {
  if (meals.length === 0) return <p className="text-slate-500">今天還沒有紀錄。</p>;
  return <div className="space-y-4">{meals.map((meal) => <MealCard key={meal.id} meal={meal} />)}</div>;
}

function MealCard({ meal }: { meal: Meal }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!confirm("確定要刪除這筆餐點紀錄？")) return;
    setLoading(true);
    const response = await fetch(`/api/meals/${meal.id}`, { method: "DELETE" });
    setLoading(false);
    if (!response.ok) {
      setError("刪除失敗");
      return;
    }
    router.refresh();
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const items = meal.items.map((item) => ({
      id: item.id,
      name: String(formData.get(`name-${item.id}`) ?? ""),
      estimatedAmount: String(formData.get(`amount-${item.id}`) ?? ""),
      calories: Number(formData.get(`calories-${item.id}`) || 0),
      protein: Number(formData.get(`protein-${item.id}`) || 0),
      fat: Number(formData.get(`fat-${item.id}`) || 0),
      carbs: Number(formData.get(`carbs-${item.id}`) || 0)
    }));
    setLoading(true);
    setError("");
    const response = await fetch(`/api/meals/${meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealType: formData.get("mealType"), items })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "儲存失敗");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <article className="rounded-2xl border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{meal.mealType}</p>
          <p className="text-sm text-slate-500">{meal.totalCalories} kcal</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button className="rounded-full bg-slate-100 px-3 py-1 font-semibold" disabled={loading} onClick={() => setEditing((value) => !value)} type="button">
            {editing ? "取消" : "修正"}
          </button>
          <button className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700" disabled={loading} onClick={onDelete} type="button">
            刪除
          </button>
        </div>
      </div>
      {meal.imageStorageKey ? <img alt="餐點照片" className="mt-3 max-h-72 w-full rounded-2xl object-cover" src={meal.imageStorageKey} /> : null}
      {editing ? (
        <form className="mt-4 space-y-3" onSubmit={onSave}>
          <select className="w-full rounded-xl border border-slate-200 px-3 py-2" name="mealType" defaultValue={meal.mealType}>
            <option value="BREAKFAST">早餐</option>
            <option value="LUNCH">午餐</option>
            <option value="DINNER">晚餐</option>
            <option value="SNACK">點心</option>
          </select>
          {meal.items.map((item) => (
            <div className="rounded-xl bg-slate-50 p-3" key={item.id}>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" defaultValue={item.name} name={`name-${item.id}`} placeholder="食物名稱" />
              <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" defaultValue={item.estimatedAmount} name={`amount-${item.id}`} placeholder="份量" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="rounded-lg border border-slate-200 px-3 py-2" defaultValue={item.calories} name={`calories-${item.id}`} placeholder="熱量" type="number" />
                <input className="rounded-lg border border-slate-200 px-3 py-2" defaultValue={Number(item.protein)} name={`protein-${item.id}`} placeholder="蛋白質" step="0.1" type="number" />
                <input className="rounded-lg border border-slate-200 px-3 py-2" defaultValue={Number(item.fat)} name={`fat-${item.id}`} placeholder="脂肪" step="0.1" type="number" />
                <input className="rounded-lg border border-slate-200 px-3 py-2" defaultValue={Number(item.carbs)} name={`carbs-${item.id}`} placeholder="碳水" step="0.1" type="number" />
              </div>
            </div>
          ))}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
            儲存修正
          </button>
        </form>
      ) : (
        <>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {meal.items.map((item) => (
              <li key={item.id}>{item.name} · {item.estimatedAmount} · {item.calories} kcal · P {Number(item.protein).toFixed(1)}g / F {Number(item.fat).toFixed(1)}g / C {Number(item.carbs).toFixed(1)}g</li>
            ))}
          </ul>
          <MacroBars protein={Number(meal.totalProtein)} fat={Number(meal.totalFat)} carbs={Number(meal.totalCarbs)} />
          {meal.aiNotes ? <p className="mt-3 text-xs text-slate-500">{meal.aiNotes}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </>
      )}
    </article>
  );
}

function MacroBars({ protein, fat, carbs }: { protein: number; fat: number; carbs: number }) {
  const total = protein + fat + carbs;
  const proteinPercent = total ? (protein / total) * 100 : 0;
  const fatPercent = total ? (fat / total) * 100 : 0;
  const carbsPercent = total ? (carbs / total) * 100 : 0;
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-sky-500" style={{ width: `${proteinPercent}%` }} />
        <div className="bg-amber-500" style={{ width: `${fatPercent}%` }} />
        <div className="bg-emerald-500" style={{ width: `${carbsPercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">蛋白質 {protein.toFixed(1)}g · 脂肪 {fat.toFixed(1)}g · 碳水 {carbs.toFixed(1)}g</p>
    </div>
  );
}
