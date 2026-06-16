"use client";

import { useMemo, useState } from "react";

export type SavedFoodSource = "MANUAL" | "NUTRITION_LABEL" | "BARCODE" | "MEAL_ITEM";

type SavedFood = {
  id: string;
  barcode?: string | null;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source?: SavedFoodSource;
  isFavorite?: boolean;
  useCount?: number;
  lastUsedAt?: string | null;
  hasImage?: boolean;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type FoodDraft = Omit<SavedFood, "id" | "useCount" | "lastUsedAt"> & { id?: string };
type FoodTab = "favorites" | "mine" | "barcoded" | "recent";

const emptyDraft: FoodDraft = {
  barcode: "",
  name: "",
  estimatedAmount: "1 份",
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  source: "MANUAL",
  isFavorite: false
};

const sourceLabels: Record<SavedFoodSource, string> = {
  MANUAL: "手動新增",
  NUTRITION_LABEL: "營養標示",
  BARCODE: "條碼綁定",
  MEAL_ITEM: "從餐點保存"
};

const tabs: { id: FoodTab; label: string }[] = [
  { id: "favorites", label: "常用" },
  { id: "mine", label: "我的新增" },
  { id: "barcoded", label: "有條碼" },
  { id: "recent", label: "最近使用" }
];

export function SavedFoodsManager({ initialFoods }: { initialFoods: SavedFood[] }) {
  const [foods, setFoods] = useState(initialFoods);
  const [draft, setDraft] = useState<FoodDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FoodTab>("favorites");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // New photo to upload (data URL), and whether to clear the existing one.
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  const visibleFoods = useMemo(() => {
    return foods.filter((food) => {
      if (activeTab === "favorites") return food.isFavorite;
      if (activeTab === "barcoded") return !!food.barcode;
      if (activeTab === "recent") return !!food.lastUsedAt || (food.useCount ?? 0) > 0;
      return true;
    });
  }, [activeTab, foods]);

  function edit(food: SavedFood) {
    setEditingId(food.id);
    setDraft({ ...food, barcode: food.barcode ?? "", source: food.source ?? "MANUAL", isFavorite: food.isFavorite ?? false });
    setDraftImage(null);
    setRemoveImage(false);
    setError("");
  }

  function reset() {
    setEditingId(null);
    setDraft(emptyDraft);
    setDraftImage(null);
    setRemoveImage(false);
    setError("");
  }

  function payloadFor(food: FoodDraft | SavedFood, override: Partial<FoodDraft> = {}) {
    return {
      barcode: (override.barcode ?? food.barcode)?.trim() || undefined,
      name: (override.name ?? food.name).trim(),
      estimatedAmount: (override.estimatedAmount ?? food.estimatedAmount).trim() || "1 份",
      calories: Number(override.calories ?? food.calories ?? 0),
      protein: Number(override.protein ?? food.protein ?? 0),
      fat: Number(override.fat ?? food.fat ?? 0),
      carbs: Number(override.carbs ?? food.carbs ?? 0),
      source: override.source ?? food.source ?? "MANUAL",
      isFavorite: override.isFavorite ?? food.isFavorite ?? false
    };
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("請填寫食物名稱。");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch(editingId ? `/api/saved-foods/${editingId}` : "/api/saved-foods", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payloadFor(draft),
        ...(draftImage ? { imageDataUrl: draftImage } : {}),
        ...(removeImage ? { removeImage: true } : {})
      })
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

  async function toggleFavorite(food: SavedFood) {
    const response = await fetch(`/api/saved-foods/${food.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(food, { isFavorite: !food.isFavorite }))
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setFoods((current) => current.map((item) => (item.id === food.id ? data.food : item)));
  }

  async function archive(id: string) {
    const response = await fetch(`/api/saved-foods/${id}`, { method: "DELETE" });
    if (response.ok) setFoods((current) => current.filter((food) => food.id !== id));
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black">我的食物管理</h2>
          <p className="mt-1 text-sm text-stone-500">管理常用食物、自建食物與產品條碼。封存後不會影響過去餐點紀錄。</p>
        </div>
        {editingId ? <button className="text-sm font-semibold text-stone-500" onClick={reset} type="button">取消編輯</button> : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl bg-stone-50 p-4 sm:grid-cols-2">
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, name: event.target.value }))} placeholder="食物名稱" value={draft.name} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, barcode: event.target.value }))} placeholder="產品條碼（選填）" value={draft.barcode ?? ""} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, estimatedAmount: event.target.value }))} placeholder="份量，例如 1 份 / 100g" value={draft.estimatedAmount} />
        <select className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, source: event.target.value as SavedFoodSource }))} value={draft.source ?? "MANUAL"}>
          {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => setDraft((v) => ({ ...v, calories: Number(event.target.value) }))} placeholder="熱量 kcal" step="0.1" type="number" value={draft.calories} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, protein: Number(event.target.value) }))} placeholder="蛋白質 g" step="0.1" type="number" value={draft.protein} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, fat: Number(event.target.value) }))} placeholder="脂肪 g" step="0.1" type="number" value={draft.fat} />
        <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, carbs: Number(event.target.value) }))} placeholder="碳水 g" step="0.1" type="number" value={draft.carbs} />
        <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
          <input checked={!!draft.isFavorite} onChange={(event) => setDraft((v) => ({ ...v, isFavorite: event.target.checked }))} type="checkbox" />
          加入常用
        </label>
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 sm:col-span-2">
          {(() => {
            const existing = editingId && !removeImage && foods.find((f) => f.id === editingId)?.hasImage;
            const src = draftImage ?? (existing ? `/api/saved-foods/${editingId}/image` : null);
            return src ? (
              <img alt="食物照片" className="h-16 w-16 rounded-lg object-cover" src={src} />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-400">無照片</div>
            );
          })()}
          <label className="cursor-pointer rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-700">
            上傳食物照片
            <input
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setDraftImage(await fileToDataUrl(file));
                setRemoveImage(false);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          {draftImage || (editingId && !removeImage && foods.find((f) => f.id === editingId)?.hasImage) ? (
            <button className="text-sm font-semibold text-red-600" onClick={() => { setDraftImage(null); setRemoveImage(true); }} type="button">移除</button>
          ) : null}
        </div>
        <button className="rounded-xl bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={saving} onClick={save} type="button">{saving ? "儲存中..." : editingId ? "儲存修改" : "新增食物"}</button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 flex gap-1 rounded-full bg-stone-100 p-1 text-sm font-semibold">
        {tabs.map((tab) => (
          <button className={`flex-1 rounded-full px-3 py-2 ${activeTab === tab.id ? "bg-amber-700 text-white" : "text-stone-600"}`} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {visibleFoods.length ? visibleFoods.map((food) => (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={food.id}>
            <div className="flex items-center gap-3">
              {food.hasImage ? <img alt={food.name} className="h-14 w-14 flex-none rounded-xl object-cover" src={`/api/saved-foods/${food.id}/image`} /> : null}
              <div>
              <p className="font-bold text-stone-900">{food.isFavorite ? "★ " : ""}{food.name} <span className="font-normal text-stone-500">· {food.estimatedAmount}</span></p>
              <p className="mt-1 text-sm text-stone-500">{food.calories} kcal · 蛋白質 {food.protein}g · 脂肪 {food.fat}g · 碳水 {food.carbs}g{food.barcode ? ` · 條碼 ${food.barcode}` : ""}</p>
              <p className="mt-1 text-xs text-stone-400">{sourceLabels[food.source ?? "MANUAL"]} · 使用 {food.useCount ?? 0} 次{food.lastUsedAt ? ` · 上次 ${new Date(food.lastUsedAt).toLocaleDateString()}` : ""}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700" onClick={() => toggleFavorite(food)} type="button">{food.isFavorite ? "取消常用" : "設為常用"}</button>
              <button className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold" onClick={() => edit(food)} type="button">編輯</button>
              <button className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600" onClick={() => archive(food.id)} type="button">封存</button>
            </div>
          </div>
        )) : <p className="p-4 text-sm text-stone-500">這個分類目前沒有食物。</p>}
      </div>
    </div>
  );
}
