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
  aiRating: string;
};

type EditableMealItem = {
  clientId: string;
  id?: string;
  name: string;
  estimatedAmount: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  aiRating: string;
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
  const [items, setItems] = useState<EditableMealItem[]>(() => meal.items.map(toEditableItem));
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
    const payloadItems = items
      .filter((item) => item.name.trim())
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        estimatedAmount: item.estimatedAmount.trim() || "未估算",
        calories: Number(item.calories || 0),
        protein: Number(item.protein || 0),
        fat: Number(item.fat || 0),
        carbs: Number(item.carbs || 0),
        aiRating: item.aiRating || "MANUAL"
      }));
    if (payloadItems.length === 0) {
      setError("至少需要保留一項食物。");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch(`/api/meals/${meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealType: formData.get("mealType"), items: payloadItems })
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
          {items.map((item, index) => (
            <div className="rounded-xl bg-slate-50 p-3" key={item.clientId}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold">食物 {index + 1}</p>
                <button className="text-sm font-semibold text-red-600 disabled:text-slate-300" disabled={items.length === 1} onClick={() => setItems((values) => values.filter((value) => value.clientId !== item.clientId))} type="button">刪除此項</button>
              </div>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "name", event.target.value)} placeholder="食物名稱" value={item.name} />
              <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "estimatedAmount", event.target.value)} placeholder="份量" value={item.estimatedAmount} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="rounded-lg border border-slate-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "calories", event.target.value)} placeholder="熱量" type="number" value={item.calories} />
                <input className="rounded-lg border border-slate-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "protein", event.target.value)} placeholder="蛋白質" step="0.1" type="number" value={item.protein} />
                <input className="rounded-lg border border-slate-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "fat", event.target.value)} placeholder="脂肪" step="0.1" type="number" value={item.fat} />
                <input className="rounded-lg border border-slate-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "carbs", event.target.value)} placeholder="碳水" step="0.1" type="number" value={item.carbs} />
              </div>
            </div>
          ))}
          <button className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setItems((values) => [...values, emptyEditableItem()])} type="button">新增食物品項</button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
            儲存修正
          </button>
        </form>
      ) : (
        <>
          <ul className="mt-3 grid gap-3">
            {meal.items.map((item) => (
              <li className="rounded-2xl bg-slate-50 p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900"><RatingBadge rating={item.aiRating} /> {item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">份量：{item.estimatedAmount}</p>
                  </div>
                  <p className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700 shadow-sm">{item.calories} kcal</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-sky-700">{Number(item.protein).toFixed(1)}g</p>
                    <p className="text-slate-500">蛋白質</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-amber-700">{Number(item.fat).toFixed(1)}g</p>
                    <p className="text-slate-500">脂肪</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-emerald-700">{Number(item.carbs).toFixed(1)}g</p>
                    <p className="text-slate-500">碳水</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <MacroBars protein={Number(meal.totalProtein)} fat={Number(meal.totalFat)} carbs={Number(meal.totalCarbs)} />
          {meal.aiNotes ? <p className="mt-3 text-xs text-slate-500">{meal.aiNotes}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </>
      )}
    </article>
  );

  function updateItem(clientId: string, field: keyof Omit<EditableMealItem, "clientId" | "id">, value: string) {
    setItems((values) => values.map((item) => (item.clientId === clientId ? { ...item, [field]: value } : item)));
  }
}

function toEditableItem(item: MealItem): EditableMealItem {
  return {
    clientId: item.id,
    id: item.id,
    name: item.name,
    estimatedAmount: item.estimatedAmount,
    calories: String(item.calories),
    protein: String(Number(item.protein)),
    fat: String(Number(item.fat)),
    carbs: String(Number(item.carbs))
    ,aiRating: item.aiRating ?? "MANUAL"
  };
}

function emptyEditableItem(): EditableMealItem {
  return { clientId: crypto.randomUUID(), name: "", estimatedAmount: "", calories: "", protein: "", fat: "", carbs: "", aiRating: "MANUAL" };
}

function RatingBadge({ rating }: { rating: string }) {
  const symbol = rating === "GOOD" ? "✅" : rating === "LIMIT" ? "❌" : rating === "MANUAL" ? "✎" : "⚠️";
  return <span title={rating}>{symbol}</span>;
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
