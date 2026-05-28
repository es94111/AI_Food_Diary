"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ManualItem = {
  id: string;
  name: string;
  estimatedAmount: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  aiRating: string;
};

function emptyManualItem(): ManualItem {
  return { id: crypto.randomUUID(), name: "", estimatedAmount: "", calories: "", protein: "", fat: "", carbs: "", aiRating: "MANUAL" };
}

export function MealCaptureForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualItems, setManualItems] = useState<ManualItem[]>([emptyManualItem()]);
  const [confirmItems, setConfirmItems] = useState<ManualItem[]>([]);
  const [confirmMealType, setConfirmMealType] = useState("LUNCH");
  const [showConfirm, setShowConfirm] = useState(false);

  async function onFileChange(file?: File) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setError("圖片不可超過 6MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    const items = itemsForPayload(manualItems);
    if (!preview && items.length === 0) {
      setError("請先上傳圖片，或在下方手動輸入食物項目。");
      return;
    }
    setLoading(true);
    try {
      if (preview) {
        const response = await fetch("/api/meals/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealType: formData.get("mealType"), imageDataUrl: preview, eatenAt: new Date().toISOString() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "分析失敗，請稍後再試");
          return;
        }
        setConfirmMealType(String(formData.get("mealType") ?? "LUNCH"));
        setConfirmItems(
          data.analysis.foods.map((food: { name: string; estimatedAmount: string; calories: number; protein: number; fat: number; carbs: number; aiRating?: string }) => ({
            id: crypto.randomUUID(),
            name: food.name,
            estimatedAmount: food.estimatedAmount,
            calories: String(food.calories),
            protein: String(food.protein),
            fat: String(food.fat),
            carbs: String(food.carbs),
            aiRating: food.aiRating ?? "OK"
          }))
        );
        setShowConfirm(true);
        return;
      }

      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType: formData.get("mealType"),
          imageDataUrl: preview,
          manualItems: items,
          eatenAt: new Date().toISOString()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "分析失敗，請稍後再試");
        return;
      }
      setPreview(undefined);
      setManualItems([emptyManualItem()]);
      form.reset();
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? `分析失敗：${error.message}` : "分析失敗，請確認服務是否正常運作");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfirmedMeal() {
    const items = itemsForPayload(confirmItems);
    if (items.length === 0) {
      setError("至少需要保留一項食物。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealType: confirmMealType, imageDataUrl: preview, manualItems: items, eatenAt: new Date().toISOString() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "儲存失敗，請稍後再試");
        return;
      }
      setPreview(undefined);
      setManualItems([emptyManualItem()]);
      setConfirmItems([]);
      setShowConfirm(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[2rem] bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black">新增餐點</h2>
      <p className="mt-2 text-sm text-slate-600">拍照或上傳圖片後可由 AI 估算；沒有圖片時也可手動輸入餐點。</p>
      <select className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3" name="mealType" defaultValue="LUNCH">
        <option value="BREAKFAST">早餐</option>
        <option value="LUNCH">午餐</option>
        <option value="DINNER">晚餐</option>
        <option value="SNACK">點心</option>
      </select>
      <input accept="image/*" capture="environment" className="mt-4 w-full rounded-2xl border border-dashed border-slate-300 px-4 py-6" type="file" onChange={(event) => onFileChange(event.target.files?.[0])} />
      {preview ? <img alt="餐點預覽" className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={preview} /> : null}
      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <h3 className="font-bold">手動新增食物</h3>
        <p className="mt-1 text-xs text-slate-500">沒有圖片或 AI 無法分析時，可以填寫以下欄位直接儲存。</p>
        <div className="mt-3 space-y-3">
          {manualItems.map((item, index) => (
            <div className="rounded-xl border border-slate-200 bg-white p-3" key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">食物 {index + 1}</p>
                <button className="text-sm font-semibold text-red-600 disabled:text-slate-300" disabled={manualItems.length === 1} onClick={() => setManualItems((items) => items.filter((value) => value.id !== item.id))} type="button">刪除</button>
              </div>
              <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => updateManualItem(item.id, "name", event.target.value)} placeholder="食物名稱，例如：炸素排" value={item.name} />
              <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => updateManualItem(item.id, "estimatedAmount", event.target.value)} placeholder="份量，例如：150g" value={item.estimatedAmount} />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="numeric" min="0" onChange={(event) => updateManualItem(item.id, "calories", event.target.value)} placeholder="熱量 kcal" type="number" value={item.calories} />
                <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "protein", event.target.value)} placeholder="蛋白質 g" step="0.1" type="number" value={item.protein} />
                <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "fat", event.target.value)} placeholder="脂肪 g" step="0.1" type="number" value={item.fat} />
                <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "carbs", event.target.value)} placeholder="碳水 g" step="0.1" type="number" value={item.carbs} />
              </div>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setManualItems((items) => [...items, emptyManualItem()])} type="button">新增另一項食物</button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "儲存中..." : preview ? "AI 分析並儲存" : "儲存餐點"}
      </button>
      <p className="mt-3 text-xs text-slate-500">AI 分析為估算值，請依實際份量修正。</p>
      {showConfirm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4">
          <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">確認 AI 辨識品項</h2>
                <p className="mt-1 text-sm text-slate-500">請確認食物是否正確，可先修正、刪除或新增後再儲存。</p>
              </div>
              <button className="rounded-full bg-slate-100 px-3 py-1 font-semibold" onClick={() => setShowConfirm(false)} type="button">關閉</button>
            </div>
            {preview ? <img alt="待確認餐點" className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={preview} /> : null}
            <div className="mt-4 space-y-3">
              {confirmItems.map((item, index) => <FoodEditor key={item.id} item={item} index={index} items={confirmItems} setItems={setConfirmItems} />)}
            </div>
            <button className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setConfirmItems((items) => [...items, emptyManualItem()])} type="button">新增食物品項</button>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <button className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} onClick={saveConfirmedMeal} type="button">
              {loading ? "儲存中..." : "確認並儲存餐點"}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );

  function updateManualItem(id: string, field: keyof Omit<ManualItem, "id">, value: string) {
    setManualItems((items) => items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }
}

function itemsForPayload(items: ManualItem[]) {
  return items
    .filter((item) => item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      estimatedAmount: item.estimatedAmount.trim() || "手動輸入",
      calories: Number(item.calories || 0),
      protein: Number(item.protein || 0),
      fat: Number(item.fat || 0),
      carbs: Number(item.carbs || 0),
      aiRating: item.aiRating
    }));
}

function FoodEditor({ item, index, items, setItems }: { item: ManualItem; index: number; items: ManualItem[]; setItems: (items: ManualItem[] | ((items: ManualItem[]) => ManualItem[])) => void }) {
  function update(field: keyof Omit<ManualItem, "id">, value: string) {
    setItems((values) => values.map((current) => (current.id === item.id ? { ...current, [field]: value } : current)));
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">食物 {index + 1}</p>
        <button className="text-sm font-semibold text-red-600 disabled:text-slate-300" disabled={items.length === 1} onClick={() => setItems((values) => values.filter((value) => value.id !== item.id))} type="button">刪除</button>
      </div>
      <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("name", event.target.value)} placeholder="食物名稱" value={item.name} />
      <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("estimatedAmount", event.target.value)} placeholder="份量" value={item.estimatedAmount} />
      <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("aiRating", event.target.value)} value={item.aiRating}>
        <option value="GOOD">✅ 較推薦</option>
        <option value="OK">⚠️ 普通</option>
        <option value="LIMIT">❌ 建議少吃</option>
        <option value="MANUAL">✎ 手動</option>
      </select>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <input className="rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("calories", event.target.value)} placeholder="熱量 kcal" type="number" value={item.calories} />
        <input className="rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("protein", event.target.value)} placeholder="蛋白質 g" step="0.1" type="number" value={item.protein} />
        <input className="rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("fat", event.target.value)} placeholder="脂肪 g" step="0.1" type="number" value={item.fat} />
        <input className="rounded-xl border border-slate-200 px-3 py-2" onChange={(event) => update("carbs", event.target.value)} placeholder="碳水 g" step="0.1" type="number" value={item.carbs} />
      </div>
    </div>
  );
}
