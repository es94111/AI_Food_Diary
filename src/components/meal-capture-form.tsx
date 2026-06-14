"use client";

import { type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownContent } from "@/components/markdown-content";

type ManualItem = {
  id: string;
  barcode?: string;
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
  barcode?: string | null;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source?: "MANUAL" | "NUTRITION_LABEL" | "BARCODE" | "MEAL_ITEM";
  isFavorite?: boolean;
};

function emptyManualItem(): ManualItem {
  return { id: crypto.randomUUID(), name: "", estimatedAmount: "", calories: "", protein: "", fat: "", carbs: "", aiRating: "MANUAL" };
}

type CaptureMode = "photo" | "describe" | "manual";

const CAPTURE_MODES: { id: CaptureMode; label: string }[] = [
  { id: "photo", label: "📷 拍照" },
  { id: "describe", label: "✍️ 描述" },
  { id: "manual", label: "⌨️ 手動" }
];

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function MealCaptureForm({ initialNextMealAdvice = "" }: { initialNextMealAdvice?: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nutritionLabelInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [previews, setPreviews] = useState<string[]>([]);
  const [preciseMode, setPreciseMode] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [nutritionLabelLoading, setNutritionLabelLoading] = useState(false);
  const [error, setError] = useState("");
  const [draggingImage, setDraggingImage] = useState(false);
  const [nextMealAdvice, setNextMealAdvice] = useState(initialNextMealAdvice);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceExpanded, setAdviceExpanded] = useState(false);
  const [manualItems, setManualItems] = useState<ManualItem[]>([emptyManualItem()]);
  const [barcode, setBarcode] = useState("");
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [confirmItems, setConfirmItems] = useState<ManualItem[]>([]);
  const [confirmMealType, setConfirmMealType] = useState("LUNCH");
  const [showConfirm, setShowConfirm] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    loadSavedFoods();
  }, []);

  useEffect(() => {
    setNextMealAdvice(initialNextMealAdvice);
  }, [initialNextMealAdvice]);

  // Validates a batch of picked/dropped files against the per-image size limit and
  // the overall count limit, returning only the data URLs that fit (and surfacing a
  // message when some were skipped).
  async function readImageFiles(files: File[], existingCount: number) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("請選擇圖片檔案。");
      return [];
    }
    const messages: string[] = [];
    if (imageFiles.length < files.length) messages.push("已略過非圖片檔案。");

    const withinSize = imageFiles.filter((file) => file.size <= MAX_IMAGE_BYTES);
    if (withinSize.length < imageFiles.length) messages.push(`部分圖片超過 6MB 已略過。`);

    const room = Math.max(0, MAX_IMAGES - existingCount);
    const accepted = withinSize.slice(0, room);
    if (withinSize.length > room) messages.push(`最多上傳 ${MAX_IMAGES} 張圖片。`);

    setError(messages.join(" "));
    return Promise.all(accepted.map((file) => fileToDataUrl(file)));
  }

  async function onFilesChange(fileList?: FileList | null) {
    if (!fileList?.length) return;
    const dataUrls = await readImageFiles(Array.from(fileList), previews.length);
    if (dataUrls.length) setPreviews((current) => [...current, ...dataUrls]);
  }

  function onImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingImage(false);
    onFilesChange(event.dataTransfer.files);
  }

  async function analyzeNutritionLabel(fileList?: FileList | null) {
    if (!fileList?.length) return;
    const imageDataUrls = await readImageFiles(Array.from(fileList), 0);
    if (imageDataUrls.length === 0) return;

    setNutritionLabelLoading(true);
    try {
      const response = await fetch("/api/meals/analyze-nutrition-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrls })
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
      const pendingBarcode = barcode.trim();
      if (pendingBarcode && items[0]) {
        items[0].barcode = pendingBarcode;
        await saveAsSavedFoodInternal(items[0], { silent: true, source: "NUTRITION_LABEL" });
        await loadSavedFoods();
        setBarcode("");
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
    const formData = new FormData(event.currentTarget);
    const mealType = String(formData.get("mealType") ?? "LUNCH");
    setError("");

    // Each capture mode hits its own analyze endpoint; the active mode alone
    // decides what gets sent, so leftover input from another tab never leaks in.
    let endpoint: string;
    let payload: Record<string, unknown>;
    if (mode === "photo") {
      if (previews.length === 0) {
        setError("請先拍照或上傳餐點圖片。");
        return;
      }
      endpoint = "/api/meals/analyze";
      payload = { mealType, imageDataUrls: previews, precise: preciseMode };
    } else if (mode === "describe") {
      const mealDescription = description.trim();
      if (!mealDescription) {
        setError("請先用文字描述你吃了什麼。");
        return;
      }
      endpoint = "/api/meals/analyze-description";
      payload = { mealType, description: mealDescription };
    } else {
      const items = itemsForPayload(manualItems);
      if (items.length === 0) {
        setError("請至少填寫一項食物名稱。");
        return;
      }
      endpoint = "/api/meals/analyze-manual";
      payload = { mealType, manualItems: items };
    }

    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, eatenAt: new Date().toISOString() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "分析失敗，請稍後再試");
        return;
      }
      setConfirmMealType(mealType);
      setConfirmItems(itemsFromAnalysis(data.analysis.foods));
      setShowConfirm(true);
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
        body: JSON.stringify({
          mealType: confirmMealType,
          imageDataUrls: mode === "photo" && previews.length ? previews : undefined,
          description: mode === "describe" ? description.trim() || undefined : undefined,
          manualItems: items,
          eatenAt: new Date().toISOString()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "儲存失敗，請稍後再試");
        return;
      }
      setPreviews([]);
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

  // Re-run AI on the user's corrected items: recomputes nutrition from the
  // edited name + amount (not the original photo) and replaces the confirm list.
  async function reanalyzeConfirmItems() {
    const items = itemsForPayload(confirmItems);
    if (items.length === 0) {
      setError("請先填寫至少一項食物名稱再重新辨識。");
      return;
    }
    setReanalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/meals/reestimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealType: confirmMealType, manualItems: items, eatenAt: new Date().toISOString() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "重新 AI 辨識失敗，請稍後再試");
        return;
      }
      setConfirmItems(itemsFromAnalysis(data.analysis.foods));
    } catch (error) {
      setError(error instanceof Error ? `重新辨識失敗：${error.message}` : "重新 AI 辨識失敗，請稍後再試");
    } finally {
      setReanalyzing(false);
    }
  }

  async function loadNextMealAdvice() {
    setAdviceLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch(`/api/recommendations/next-meal?tz=${encodeURIComponent(tz)}`);
    const data = await response.json().catch(() => ({}));
    setAdviceLoading(false);
    if (response.ok) {
      setNextMealAdvice(data.advice ?? "");
      setAdviceExpanded(true);
    }
  }

  async function loadSavedFoods() {
    const response = await fetch("/api/saved-foods");
    const data = await response.json().catch(() => ({}));
    if (response.ok) setSavedFoods(data.foods ?? []);
  }

  async function saveAsSavedFood(item: ManualItem) {
    return saveAsSavedFoodInternal(item, { silent: false, source: "MEAL_ITEM" });
  }

  async function saveAsSavedFoodInternal(item: ManualItem, options: { silent: boolean; source: SavedFood["source"] }) {
    if (!item.name.trim()) {
      if (!options.silent) setError("請先填寫食物名稱再儲存為常用食物。");
      return;
    }
    const response = await fetch("/api/saved-foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode: item.barcode?.trim() || undefined,
        name: item.name.trim(),
        estimatedAmount: item.estimatedAmount.trim() || "1 份",
        calories: Number(item.calories || 0),
        protein: Number(item.protein || 0),
        fat: Number(item.fat || 0),
        carbs: Number(item.carbs || 0),
        source: options.source,
        isFavorite: true
      })
    });
    if (response.ok) await loadSavedFoods();
  }

  async function lookupBarcode() {
    const code = barcode.trim();
    if (!code) {
      setError("請先輸入或掃描產品條碼。");
      return;
    }
    setError("");
    const response = await fetch(`/api/saved-foods?barcode=${encodeURIComponent(code)}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.food) {
      addSavedFood(data.food, { markUsed: false });
      setBarcode("");
      return;
    }
    setError("尚未紀錄此條碼。請上傳營養標示，系統會把辨識結果綁定到這個條碼，下次掃描即可帶入。");
  }

  async function deleteSavedFood(id: string) {
    const response = await fetch(`/api/saved-foods/${id}`, { method: "DELETE" });
    if (response.ok) setSavedFoods((foods) => foods.filter((food) => food.id !== id));
  }

  async function markSavedFoodUsed(id: string) {
    await fetch(`/api/saved-foods/${id}`, { method: "POST" });
    await loadSavedFoods();
  }

  function addSavedFood(food: SavedFood, options: { markUsed: boolean } = { markUsed: true }) {
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
    if (options.markUsed) markSavedFoodUsed(food.id);
  }

  return (
    <form onSubmit={onSubmit} className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-2xl font-black">新增餐點</h2>
      <p className="mt-2 text-sm text-stone-600">選擇一種方式記錄餐點，AI 會先估算營養數據供你確認。</p>
      <select className="mt-5 w-full rounded-2xl border border-stone-200 px-4 py-3" name="mealType" defaultValue="LUNCH">
        <option value="BREAKFAST">早餐</option>
        <option value="LUNCH">午餐</option>
        <option value="DINNER">晚餐</option>
        <option value="SNACK">點心</option>
      </select>
      <div className="mt-4 flex gap-1 rounded-full bg-stone-100 p-1 text-sm font-semibold" role="tablist">
        {CAPTURE_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={`flex-1 cursor-pointer rounded-full px-3 py-2 text-center transition-colors ${
              mode === m.id ? "bg-amber-700 text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
            }`}
            onClick={() => {
              setMode(m.id);
              setError("");
            }}
            type="button"
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "photo" ? (
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
            <p className="mt-1 text-xs text-stone-500">可一次拍照或上傳多張餐點照片（最多 {MAX_IMAGES} 張），AI 會綜合所有照片辨識食物、估算營養並產生評分。</p>
          </div>
          <div className="flex gap-2">
            {previews.length ? (
              <button className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setPreviews([])} type="button">全部移除</button>
            ) : null}
            <button className="cursor-pointer rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60" disabled={previews.length >= MAX_IMAGES} onClick={() => fileInputRef.current?.click()} type="button">選擇圖片</button>
          </div>
        </div>
        <input ref={fileInputRef} accept="image/*" capture="environment" multiple className="sr-only" type="file" onChange={(event) => { onFilesChange(event.target.files); event.target.value = ""; }} />
        {previews.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {previews.map((src, index) => (
              <div className="group relative" key={`${src.slice(0, 32)}-${index}`}>
                <img alt={`餐點預覽 ${index + 1}`} className="h-32 w-full rounded-2xl object-cover" src={src} />
                <button
                  aria-label={`移除圖片 ${index + 1}`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-stone-950/70 px-2 py-0.5 text-xs font-semibold text-white"
                  onClick={() => setPreviews((current) => current.filter((_, i) => i !== index))}
                  type="button"
                >
                  ✕
                </button>
              </div>
            ))}
            {previews.length < MAX_IMAGES ? (
              <button className="flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800" onClick={() => fileInputRef.current?.click()} type="button">
                + 新增圖片
              </button>
            ) : null}
          </div>
        ) : (
          <button className="mt-4 w-full rounded-2xl bg-amber-50 px-4 py-8 text-center text-sm font-semibold text-amber-800" onClick={() => fileInputRef.current?.click()} type="button">
            點此拍照/上傳，或將圖片拖放到這裡（可多張）
          </button>
        )}
        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm">
          <input
            checked={preciseMode}
            className="mt-0.5 h-4 w-4 accent-amber-700"
            onChange={(event) => setPreciseMode(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="font-semibold text-amber-950">精準模式</span>
            <span className="ml-1 text-xs text-amber-700">多次辨識取中位數，熱量更穩定（分析較慢、用量約 3 倍）。</span>
          </span>
        </label>
      </div>
      ) : null}
      {mode === "describe" ? (
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
      ) : null}
      {mode === "manual" ? (
      <>
      <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <p className="text-sm font-bold">常用食物</p>
        {savedFoods.length ? (
          <div className="mt-2 grid gap-2">
            {savedFoods.map((food) => (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 p-2 text-sm" key={food.id}>
                <button className="text-left font-semibold text-stone-800" onClick={() => addSavedFood(food)} type="button">+ {food.name} · {food.estimatedAmount} · {food.calories} kcal</button>
                <button className="shrink-0 text-red-600" onClick={() => deleteSavedFood(food.id)} type="button">封存</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">尚無常用食物，可在下方手動食物列按「存常用」新增。</p>
        )}
      </div>
      <div className="mt-5 rounded-2xl bg-stone-50 p-4">
        <h3 className="font-bold">手動新增食物</h3>
        <p className="mt-1 text-xs text-stone-500">填寫以下欄位（或上傳營養標示／選用常用食物），AI 會先判斷推薦評分再讓你確認。</p>
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3">
          <p className="text-sm font-bold text-stone-900">產品條碼</p>
          <p className="mt-1 text-xs text-stone-500">輸入或用手機掃描條碼；若尚未紀錄，先上傳營養標示後會自動綁定。</p>
          <div className="mt-2 flex gap-2">
            <input className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2" inputMode="numeric" onChange={(event) => setBarcode(event.target.value)} placeholder="例如：471..." value={barcode} />
            <button className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white" onClick={lookupBarcode} type="button">查詢</button>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-950">拍攝或上傳營養標示</p>
              <p className="mt-1 text-xs text-amber-700">可一次上傳多張不同商品的標示（最多 {MAX_IMAGES} 張），AI 會讀取每份熱量、蛋白質、脂肪與碳水，各自新增成一項食物。</p>
            </div>
            <button className="cursor-pointer rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60" disabled={nutritionLabelLoading} onClick={() => nutritionLabelInputRef.current?.click()} type="button">
              {nutritionLabelLoading ? "辨識中..." : "上傳營養標示"}
            </button>
          </div>
          <input ref={nutritionLabelInputRef} accept="image/*" capture="environment" multiple className="sr-only" type="file" onChange={(event) => analyzeNutritionLabel(event.target.files)} />
        </div>
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
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "calories", event.target.value)} placeholder="熱量 kcal" step="0.1" type="number" value={item.calories} />
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "protein", event.target.value)} placeholder="蛋白質 g" step="0.1" type="number" value={item.protein} />
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "fat", event.target.value)} placeholder="脂肪 g" step="0.1" type="number" value={item.fat} />
                <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => updateManualItem(item.id, "carbs", event.target.value)} placeholder="碳水 g" step="0.1" type="number" value={item.carbs} />
              </div>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full rounded-xl border border-dashed border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setManualItems((items) => [...items, emptyManualItem()])} type="button">新增另一項食物</button>
      </div>
      </>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button className="mt-5 w-full cursor-pointer rounded-2xl bg-amber-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "分析中..." : "AI 分析並確認"}
      </button>
      <p className="mt-3 text-xs text-stone-500">AI 分析為估算值，請依實際份量修正。</p>
      {adviceLoading ? <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">正在產生下一餐建議...</p> : null}
      {nextMealAdvice ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4">
          <button
            aria-expanded={adviceExpanded}
            className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
            onClick={() => setAdviceExpanded((value) => !value)}
            type="button"
          >
            <h3 className="font-black text-amber-900">下一餐建議</h3>
            <span className={`text-amber-700 transition-transform ${adviceExpanded ? "rotate-180" : ""}`} aria-hidden>▾</span>
          </button>
          {adviceExpanded ? (
            <>
              <p className="mt-1 text-xs text-amber-700">此建議會保留到今天結束；新增下一餐後會自動更新。</p>
              <MarkdownContent className="mt-2 text-amber-900" content={nextMealAdvice} />
            </>
          ) : null}
        </div>
      ) : null}
      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-2xl font-black">確認 AI 分析品項</h2>
              <p className="mt-1 text-sm text-stone-500">請確認食物是否正確，可先修正、刪除或新增後再儲存。</p>
            </div>
            <button className="shrink-0 rounded-full bg-stone-100 px-3 py-1 font-semibold" onClick={() => setShowConfirm(false)} type="button">關閉</button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-3xl">
              {previews.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {previews.map((src, index) => (
                    <img alt={`待確認餐點 ${index + 1}`} className="h-32 w-full rounded-2xl object-cover" key={`${src.slice(0, 32)}-${index}`} src={src} />
                  ))}
                </div>
              ) : null}
              <div className="mt-4 space-y-3">
                {confirmItems.map((item, index) => <FoodEditor key={item.id} item={item} index={index} items={confirmItems} setItems={setConfirmItems} />)}
              </div>
              <button className="mt-3 w-full rounded-xl border border-dashed border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setConfirmItems((items) => [...items, emptyManualItem()])} type="button">新增食物品項</button>
              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
              <button
                className="mt-4 w-full cursor-pointer rounded-2xl border border-amber-700 px-4 py-3 font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-60"
                disabled={loading || reanalyzing}
                onClick={reanalyzeConfirmItems}
                type="button"
              >
                {reanalyzing ? "重新辨識中..." : "依修改重新 AI 辨識"}
              </button>
              <p className="mt-2 text-xs text-stone-500">修改食物名稱或份量後，可讓 AI 依修正內容重新估算熱量與營養素。</p>
              <button className="mt-3 w-full cursor-pointer rounded-2xl bg-amber-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60" disabled={loading || reanalyzing} onClick={saveConfirmedMeal} type="button">
                {loading ? "儲存中..." : "確認並儲存餐點"}
              </button>
            </div>
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

function itemsFromAnalysis(foods: Array<{ name: string; estimatedAmount: string; calories: number; protein: number; fat: number; carbs: number; aiRating?: string }>): ManualItem[] {
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
        <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" onChange={(event) => update("calories", event.target.value)} placeholder="熱量 kcal" step="0.1" type="number" value={item.calories} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("protein", event.target.value)} placeholder="蛋白質 g" step="0.1" type="number" value={item.protein} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("fat", event.target.value)} placeholder="脂肪 g" step="0.1" type="number" value={item.fat} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update("carbs", event.target.value)} placeholder="碳水 g" step="0.1" type="number" value={item.carbs} />
      </div>
    </div>
  );
}
