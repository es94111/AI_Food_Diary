"use client";

import { useState } from "react";

type SavedFood = {
  id: string;
  barcode?: string | null;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type FoodDraft = Omit<SavedFood, "id"> & { id?: string };

const emptyDraft: FoodDraft = {
  barcode: "",
  name: "",
  estimatedAmount: "1 份",
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0
};

export function SavedFoodsManager({ initialFoods }: { initialFoods: SavedFood[] }) {
  const [foods, setFoods] = useState(initialFoods);
  const [draft, setDraft] = useState<FoodDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function edit(food: SavedFood) {
    setEditingId(food.id);
    setDraft({ ...food, barcode: food.barcode ?? "" });
    setError("");
  }

  function reset() {
    setEditingId(null);
    setDraft(emptyDraft);
    setError("");
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("請填寫食物名稱。");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      barcode: draft.barcode?.trim() || undefined,
      name: draft.name.trim(),
      estimatedAmount: draft.estimatedAmount.trim() || "1 份",
      calories: Number(draft.calories || 0),
      protein: Number(draft.protein || 0),
      fat: Number(draft.fat || 0),
      carbs: Number(draft.carbs || 0)
    };
    const response = await fetch(editingId ? `/api/saved-foods/${editingId}` : "/api/saved-foods", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "儲存失敗，請稍後再試。");
      return;
    }
    const food = data.food as SavedFood;
    setFoods((current) => [food, ...current.filter((item) => item.id !== food.id)]);
    reset();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/saved-foods/${id}`, { method: "DELETE" });
    if (response.ok) setFoods((current) => current.filter((food) => food.id !== id));
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black">常用食物管理</h2>
          <p className="mt-1 text-sm text-stone-500">管理你自己新增的食物與產品條碼。條碼命中後，手動紀錄會直接帶入營養標示。</p>
        </div>
        {editingId ? <button className="text-sm font-semibold text-stone-500" onClick={reset} type="button">取消編輯</button> : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl bg-stone-50 p-4 sm:grid-cols-2">
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, name: event.target.value }))} placeholder="食物名稱" value={draft.name} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, barcode: event.target.value }))} placeholder="產品條碼（選填）" value={draft.barcode ?? ""} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, estimatedAmount: event.target.value }))} placeholder="份量，例如 1 份 / 100g" value={draft.estimatedAmount} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, calories: Number(event.target.value) }))} placeholder="熱量 kcal" type="number" value={draft.calories} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, protein: Number(event.target.value) }))} placeholder="蛋白質 g" step="0.1" type="number" value={draft.protein} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, fat: Number(event.target.value) }))} placeholder="脂肪 g" step="0.1" type="number" value={draft.fat} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, carbs: Number(event.target.value) }))} placeholder="碳水 g" step="0.1" type="number" value={draft.carbs} />
        <button className="rounded-xl bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={saving} onClick={save} type="button">{saving ? "儲存中..." : editingId ? "儲存修改" : "新增食物"}</button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {foods.length ? foods.map((food) => (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={food.id}>
            <div>
              <p className="font-bold text-stone-900">{food.name} <span className="font-normal text-stone-500">· {food.estimatedAmount}</span></p>
              <p className="mt-1 text-sm text-stone-500">{food.calories} kcal · P {food.protein}g · F {food.fat}g · C {food.carbs}g{food.barcode ? ` · 條碼 ${food.barcode}` : ""}</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold" onClick={() => edit(food)} type="button">編輯</button>
              <button className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600" onClick={() => remove(food.id)} type="button">刪除</button>
            </div>
          </div>
        )) : <p className="p-4 text-sm text-stone-500">尚無常用食物。</p>}
      </div>
    </div>
  );
}
