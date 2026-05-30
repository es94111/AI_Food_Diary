"use client";

import { type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownContent } from "@/components/markdown-content";

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

type SavedFood = {
  id: string;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

function emptyManualItem(): ManualItem {
  return { id: crypto.randomUUID(), name: "", estimatedAmount: "", calories: "", protein: "", fat: "", carbs: "", aiRating: "MANUAL" };
}

export function MealCaptureForm({ initialNextMealAdvice = "" }: { initialNextMealAdvice?: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nutritionLabelInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [nutritionLabelLoading, setNutritionLabelLoading] = useState(false);
  const [error, setError] = useState("");
  const [draggingImage, setDraggingImage] = useState(false);
  const [nextMealAdvice, setNextMealAdvice] = useState(initialNextMealAdvice);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [manualItems, setManualItems] = useState<ManualItem[]>([emptyManualItem()]);
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [confirmItems, setConfirmItems] = useState<ManualItem[]>([]);
  const [confirmMealType, setConfirmMealType] = useState("LUNCH");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    loadSavedFoods();
  }, []);

  useEffect(() => {
    setNextMealAdvice(initialNextMealAdvice);
  }, [initialNextMealAdvice]);

  async function onFileChange(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("請選擇圖片檔案。");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("圖片不可超過 6MB");
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function onImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingImage(false);
    onFileChange(event.dataTransfer.files?.[0]);
  }

  async function analyzeNutritionLabel(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("請選擇營養標示圖片檔案。");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("營養標示圖片不可超過 6MB");
      return;
    }

    setError("");
    setNutritionLabelLoading(true);
    try {
      const imageDataUrl = await fileToDataUrl(file);
      const response = await fetch("/api/meals/analyze-nutrition-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "營養標示分析失敗，請稍後再試");
        return;
      }
      const items = itemsFromAnalysis(data.analysis.foods);
      if (items.length === 0) {
        setError("AI 沒有辨識到營養標示內容，請換一張更清楚的圖片。");
        return;
      }
      setManualItems((current) => [...current.filter((item) => item.name.trim()), ...items]);
    } catch (error) {
      setError(error instanceof Error ? `營養標示分析失敗：${error.message}` : "營養標示分析失敗，請稍後再試");
    } finally {
      setNutritionLabelLoading(false);
      if (nutritionLabelInputRef.current) nutritionLabelInputRef.current.value = "";
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    const items = itemsForPayload(manualItems);
    const mealDescription = description.trim();
    if (!preview && !mealDescription && items.length === 0) {
      setError("請先上傳圖片、描述餐點，或在下方手動輸入食物項目。");
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
        setConfirmItems(itemsFromAnalysis(data.analysis.foods));
        setShowConfirm(true);
        return;
      }

      if (mealDescription) {
        const response = await fetch("/api/meals/analyze-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealType: formData.get("mealType"), description: mealDescription, eatenAt: new Date().toISOString() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "分析失敗，請稍後再試");
          return;
        }
        setConfirmMealType(String(formData.get("mealType") ?? "LUNCH"));
        setConfirmItems(itemsFromAnalysis(data.analysis.foods));
        setShowConfirm(true);
        return;
      }

      if (items.length > 0) {
        const response = await fetch("/api/meals/analyze-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealType: formData.get("mealType"), manualItems: items, eatenAt: new Date().toISOString() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "AI 評分失敗，請稍後再試");
          return;
        }
        setConfirmMealType(String(formData.get("mealType") ?? "LUNCH"));
        setConfirmItems(itemsFromAnalysis(data.analysis.foods));
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
      setDescription("");
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
        body: JSON.stringify({ mealType: confirmMealType, imageDataUrl: preview, description: description.trim() || undefined, manualItems: items, eatenAt: new Date().toISOString() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "儲存失敗，請稍後再試");
        return;
      }
      setPreview(undefined);
      setDescription("");
      setManualItems([emptyManualItem()]);
      setConfirmItems([]);
      setShowConfirm(false);
      await loadNextMealAdvice();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function loadNextMealAdvice() {
    setAdviceLoading(true);
    const response = await fetch("/api/recommendations/next-meal");
    const data = await response.json().catch(() => ({}));
    setAdviceLoading(false);
    if (response.ok) setNextMealAdvice(data.advice ?? "");
  }

  async function loadSavedFoods() {
    const response = await fetch("/api/saved-foods");
    const data = await response.json().catch(() => ({}));
    if (response.ok) setSavedFoods(data.foods ?? []);
  }

  async function saveAsSavedFood(item: ManualItem) {
    if (!item.name.trim()) {
      setError("請先填寫食物名稱再儲存為常用食物。");
      return;
    }
    const response = await fetch("/api/saved-foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name.trim(),
        estimatedAmount: item.estimatedAmount.trim() || "1 份",
        calories: Number(item.calories || 0),
        protein: Number(item.protein || 0),
        fat: Number(item.fat || 0),
        carbs: Number(item.carbs || 0)
      })
    });
    if (response.ok) await loadSavedFoods();
  }

  async function deleteSavedFood(id: string) {
    const response = await fetch(`/api/saved-foods/${id}`, { method: "DELETE" });
    if (response.ok) setSavedFoods((foods) => foods.filter((food) => food.id !== id));
  }

  function addSavedFood(food: SavedFood) {
    setManualItems((items) => [
      ...items.filter((item) => item.name.trim()),
      {
        id: crypto.randomUUID(),
        name: food.name,
        estimatedAmount: food.estimatedAmount,
        calories: String(food.calories),
        protein: String(food.protein),
        fat: String(food.fat),
        carbs: String(food.carbs),
        aiRating: "MANUAL"
      }
    ]);
  }

  const hasManualItems = manualItems.some((item) => item.name.trim());

  return (
    <form onSubmit={onSubmit} className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-2xl font-black">新增餐點</h2>
      <p className="mt-2 text-sm text-stone-600">拍照、上傳圖片，或直接描述你吃了什麼，AI 會先估算營養數據供你確認。</p>
      <select className="mt-5 w-full rounded-2xl border border-stone-200 px-4 py-3" name="mealType" defaultValue="LUNCH">
        <option value="BREAKFAST">早餐</option>
        <option value="LUNCH">午餐</option>
        <option value="DINNER">晚餐</option>
        <option value="SNACK">點心</option>
      </select>
      <div
        className={`mt-5 rounded-2xl border border-dashed p-4 transition ${draggingImage ? "border-amber-500 bg-amber-50" : "border-amber-200 bg-white"}`}
        onDragLeave={() => setDraggingImage(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDraggingImage(true);
        }}
        onDrop={onImageDrop}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-amber-950">從圖片上傳食物</h3>
            <p className="mt-1 text-xs text-stone-500">拍照或上傳餐點照片，AI 會辨識食物、估算營養並產生評分。</p>
          </div>
          <div className="flex gap-2">
            {preview ? (
              <button className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setPreview(undefined)} type="button">移除圖片</button>
            ) : null}
            <button className="cursor-pointer rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800" onClick={() => fileInputRef.current?.click()} type="button">選擇圖片</button>
          </div>
        </div>
        <input ref={fileInputRef} accept="image/*" capture="environment" className="sr-only" type="file" onChange={(event) => onFileChange(event.target.files?.[0])} />
        {preview ? (
          <img alt="餐點預覽" className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={preview} />
        ) : (
          <button className="mt-4 w-full rounded-2xl bg-amber-50 px-4 py-8 text-center text-sm font-semibold text-amber-800" onClick={() => fileInputRef.current?.click()} type="button">
            點此拍照/上傳，或將圖片拖放到這裡
          </button>
        )}
      </div>
      <div className="mt-5 rounded-2xl bg-amber-50 p-4">
        <h3 className="font-bold text-amber-950">用文字描述餐點</h3>
        <p className="mt-1 text-xs text-amber-700">例如：午餐吃一碗滷肉飯、一顆滷蛋、半碗青菜和無糖豆漿。</p>
        <textarea
          className="mt-3 min-h-24 w-full rounded-xl border border-amber-100 bg-white px-3 py-2 outline-none focus:border-amber-400"
          maxLength={1200}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="描述你吃了什麼、份量大概多少..."
          value={description}
        />
      </div>
      <div className="mt-5 rounded-2xl bg-stone-50 p-4">
        <h3 className="font-bold">手動新增食物</h3>
        <p className="mt-1 text-xs text-stone-500">沒有圖片、文字描述，或 AI 無法分析時，可以填寫以下欄位，AI 會先判斷推薦評分再讓你確認。</p>
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-950">拍攝或上傳營養標示</p>
              <p className="mt-1 text-xs text-amber-700">AI 會讀取每份熱量、蛋白質、脂肪與碳水，快速新增成一項食物。</p>
            </div>
            <button className="cursor-pointer rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60" disabled={nutritionLabelLoading} onClick={() => nutritionLabelInputRef.current?.click()} type="button">
              {nutritionLabelLoading ? "辨識中..." : "上傳營養標示"}
            </button>
          </div>
          <input ref={nutritionLabelInputRef} accept="image/*" capture="environment" className="sr-only" type="file" onChange={(event) => analyzeNutritionLabel(event.target.files?.[0])} />
        </div>
        {savedFoods.length ? (
          <div className="mt-3 rounded-2xl bg-white p-3">
            <p className="text-sm font-bold">常用食物</p>
            <div className="mt-2 grid gap-2">
              {savedFoods.map((food) => (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 p-2 text-sm" key={food.id}>
                  <button className="text-left font-semibold text-stone-800" onClick={() => addSavedFood(food)} type="button">+ {food.name} · {food.estimatedAmount} · {food.calories} kcal</button>
                  <button className="shrink-0 text-red-600" onClick={() => deleteSavedFood(food.id)} type="button">刪除</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          {manualItems.map((item, index) => (
            <div className="rounded-xl border border-stone-200 bg-white p-3" key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">食物 {index + 1}</p>
                <div className="flex gap-2">
                  <button className="text-sm font-semibold text-amber-700" onClick={() => saveAsSavedFood(item)} type="button">存常用</button>
                  <button className="text-sm font-semibold text-red-600 disabled:text-stone-300" disabled={manualItems.length === 1} onClick={() => setManualItems((items) => items.filter((value) => value.id !== item.id))} type="button">刪除</button>
                </div>
              </div>
              <input className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => updateManualItem(item.id, "name", event.target.value)} placeholder="食物名稱，例如：炸素排" value={item.name} />
              <input className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => updateManualItem(item.id, "estimatedAmount", event.target.value)} placeholder="份量，例如：150g" value={item.estimatedAmount} />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="numeric" min="0" onChange={(event) => updateManualItem(item.id, "calories", event.target.value)} placeholder="熱量 kcal" type="number" value={item.calories} />
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "protein", event.target.value)} placeholder="蛋白質 g" step="0.1" type="number" value={item.protein} />
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "fat", event.target.value)} placeholder="脂肪 g" step="0.1" type="number" value={item.fat} />
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "carbs", event.target.value)} placeholder="碳水 g" step="0.1" type="number" value={item.carbs} />
              </div>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full rounded-xl border border-dashed border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setManualItems((items) => [...items, emptyManualItem()])} type="button">新增另一項食物</button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button className="mt-5 w-full cursor-pointer rounded-2xl bg-amber-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "儲存中..." : preview || description.trim() || hasManualItems ? "AI 分析並確認" : "儲存餐點"}
      </button>
      <p className="mt-3 text-xs text-stone-500">AI 分析為估算值，請依實際份量修正。</p>
      {adviceLoading ? <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">正在產生下一餐建議...</p> : null}
      {nextMealAdvice ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4">
          <h3 className="font-black text-amber-900">下一餐建議</h3>
          <p className="mt-1 text-xs text-amber-700">此建議會保留到今天結束；新增下一餐後會自動更新。</p>
          <MarkdownContent className="mt-2 text-amber-900" content={nextMealAdvice} />
        </div>
      ) : null}
      {showConfirm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/70 p-4">
          <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">確認 AI 分析品項</h2>
                <p className="mt-1 text-sm text-stone-500">請確認食物是否正確，可先修正、刪除或新增後再儲存。</p>
              </div>
              <button className="rounded-full bg-stone-100 px-3 py-1 font-semibold" onClick={() => setShowConfirm(false)} type="button">關閉</button>
            </div>
            {preview ? <img alt="待確認餐點" className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={preview} /> : null}
            <div className="mt-4 space-y-3">
              {confirmItems.map((item, index) => <FoodEditor key={item.id} item={item} index={index} items={confirmItems} setItems={setConfirmItems} />)}
            </div>
            <button className="mt-3 w-full rounded-xl border border-dashed border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setConfirmItems((items) => [...items, emptyManualItem()])} type="button">新增食物品項</button>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <button className="mt-4 w-full cursor-pointer rounded-2xl bg-amber-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60" disabled={loading} onClick={saveConfirmedMeal} type="button">
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

function itemsFromAnalysis(foods: Array<{ name: string; estimatedAmount: string; calories: number; protein: number; fat: number; carbs: number; aiRating?: string }>) {
  return foods.map((food) => ({
    id: crypto.randomUUID(),
    name: food.name,
    estimatedAmount: food.estimatedAmount,
    calories: String(food.calories),
    protein: String(food.protein),
    fat: String(food.fat),
    carbs: String(food.carbs),
    aiRating: food.aiRating ?? "OK"
  }));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("無法讀取圖片檔案"));
    reader.readAsDataURL(file);
  });
}

function FoodEditor({ item, index, items, setItems }: { item: ManualItem; index: number; items: ManualItem[]; setItems: (items: ManualItem[] | ((items: ManualItem[]) => ManualItem[])) => void }) {
  function update(field: keyof Omit<ManualItem, "id">, value: string) {
    setItems((values) => values.map((current) => (current.id === item.id ? { ...current, [field]: value } : current)));
  }

  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">食物 {index + 1}</p>
        <button className="text-sm font-semibold text-red-600 disabled:text-stone-300" disabled={items.length === 1} onClick={() => setItems((values) => values.filter((value) => value.id !== item.id))} type="button">刪除</button>
      </div>
      <input className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("name", event.target.value)} placeholder="食物名稱" value={item.name} />
      <input className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("estimatedAmount", event.target.value)} placeholder="份量" value={item.estimatedAmount} />
      <select className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("aiRating", event.target.value)} value={item.aiRating}>
        <option value="GOOD">✅ 較推薦</option>
        <option value="OK">⚠️ 普通</option>
        <option value="LIMIT">❌ 建議少吃</option>
        <option value="MANUAL">✎ 手動</option>
      </select>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("calories", event.target.value)} placeholder="熱量 kcal" type="number" value={item.calories} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("protein", event.target.value)} placeholder="蛋白質 g" step="0.1" type="number" value={item.protein} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("fat", event.target.value)} placeholder="脂肪 g" step="0.1" type="number" value={item.fat} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("carbs", event.target.value)} placeholder="碳水 g" step="0.1" type="number" value={item.carbs} />
      </div>
    </div>
  );
}
