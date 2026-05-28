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
};

function emptyManualItem(): ManualItem {
  return { id: crypto.randomUUID(), name: "", estimatedAmount: "", calories: "", protein: "", fat: "", carbs: "" };
}

export function MealCaptureForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualItems, setManualItems] = useState<ManualItem[]>([emptyManualItem()]);

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
    const items = manualItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        estimatedAmount: item.estimatedAmount.trim() || "手動輸入",
        calories: Number(item.calories || 0),
        protein: Number(item.protein || 0),
        fat: Number(item.fat || 0),
        carbs: Number(item.carbs || 0)
      }));
    if (!preview && items.length === 0) {
      setError("請先上傳圖片，或在下方手動輸入食物項目。");
      return;
    }
    setLoading(true);
    try {
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
    </form>
  );

  function updateManualItem(id: string, field: keyof Omit<ManualItem, "id">, value: string) {
    setManualItems((items) => items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }
}
