"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function MealCaptureForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    const manualName = String(formData.get("manualName") ?? "").trim();
    const manualAmount = String(formData.get("manualAmount") ?? "").trim();
    const manualItem = manualName
      ? [
          {
            name: manualName,
            estimatedAmount: manualAmount || "手動輸入",
            calories: Number(formData.get("manualCalories") || 0),
            protein: Number(formData.get("manualProtein") || 0),
            fat: Number(formData.get("manualFat") || 0),
            carbs: Number(formData.get("manualCarbs") || 0)
          }
        ]
      : [];
    if (!preview && manualItem.length === 0) {
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
          manualItems: manualItem,
          eatenAt: new Date().toISOString()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "分析失敗，請稍後再試");
        return;
      }
      setPreview(undefined);
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
        <input className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2" name="manualName" placeholder="食物名稱，例如：雞胸便當" />
        <input className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2" name="manualAmount" placeholder="份量，例如：1 份、150g" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="numeric" min="0" name="manualCalories" placeholder="熱量 kcal" type="number" />
          <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="decimal" min="0" name="manualProtein" placeholder="蛋白質 g" step="0.1" type="number" />
          <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="decimal" min="0" name="manualFat" placeholder="脂肪 g" step="0.1" type="number" />
          <input className="rounded-xl border border-slate-200 px-3 py-2" inputMode="decimal" min="0" name="manualCarbs" placeholder="碳水 g" step="0.1" type="number" />
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "儲存中..." : preview ? "AI 分析並儲存" : "儲存餐點"}
      </button>
      <p className="mt-3 text-xs text-slate-500">AI 分析為估算值，請依實際份量修正。</p>
    </form>
  );
}
