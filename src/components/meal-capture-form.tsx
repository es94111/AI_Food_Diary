"use client";

import { useState } from "react";
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

  async function onSubmit(formData: FormData) {
    setError("");
    setLoading(true);
    const response = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mealType: formData.get("mealType"),
        imageDataUrl: preview,
        eatenAt: new Date().toISOString()
      })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "分析失敗");
      return;
    }
    setPreview(undefined);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="rounded-[2rem] bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black">新增餐點</h2>
      <p className="mt-2 text-sm text-slate-600">拍照或上傳圖片後，AI 會估算熱量與營養素。</p>
      <select className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3" name="mealType" defaultValue="LUNCH">
        <option value="BREAKFAST">早餐</option>
        <option value="LUNCH">午餐</option>
        <option value="DINNER">晚餐</option>
        <option value="SNACK">點心</option>
      </select>
      <input accept="image/*" capture="environment" className="mt-4 w-full rounded-2xl border border-dashed border-slate-300 px-4 py-6" type="file" onChange={(event) => onFileChange(event.target.files?.[0])} />
      {preview ? <img alt="餐點預覽" className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={preview} /> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "AI 分析中..." : "分析並儲存"}
      </button>
      <p className="mt-3 text-xs text-slate-500">AI 分析為估算值，請依實際份量修正。</p>
    </form>
  );
}
