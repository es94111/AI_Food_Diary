"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
  eatenAt: string;
  imageStorageKey: string | null;
  imageUrls?: string[];
  totalCalories: number;
  totalProtein: number | string;
  totalFat: number | string;
  totalCarbs: number | string;
  aiNotes: string | null;
  items: MealItem[];
};

const MEAL_TYPE_LABELS: Record<string, string> = {
  BREAKFAST: "早餐",
  LUNCH: "午餐",
  DINNER: "晚餐",
  SNACK: "點心"
};

export function MealList({ meals }: { meals: Meal[] }) {
  if (meals.length === 0) return <p className="text-stone-500">今天還沒有紀錄。</p>;
  return <div className="space-y-4">{meals.map((meal) => <MealCard key={meal.id} meal={meal} />)}</div>;
}

function MealCard({ meal }: { meal: Meal }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<EditableMealItem[]>(() => meal.items.map(toEditableItem));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const imageUrls = meal.imageUrls?.length ? meal.imageUrls : meal.imageStorageKey ? [meal.imageStorageKey] : [];

  // Retroactively attach photos to a meal logged without one (e.g. the
  // describe/manual flow), or add more to an existing set.
  async function onAddPhotos(fileList: FileList | null) {
    if (!fileList?.length) return;
    const images = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setError("請選擇圖片檔案。");
      return;
    }
    const room = MAX_IMAGES - imageUrls.length;
    if (room <= 0) {
      setError(`每筆餐點最多 ${MAX_IMAGES} 張照片。`);
      return;
    }
    const withinSize = images.filter((file) => file.size <= MAX_IMAGE_BYTES);
    const accepted = withinSize.slice(0, room);
    if (accepted.length === 0) {
      setError("圖片超過 6MB，請改用較小的圖片。");
      return;
    }
    setUploadingPhoto(true);
    setError("");
    try {
      const imageDataUrls = await Promise.all(accepted.map(fileToDataUrl));
      const response = await fetch(`/api/meals/${meal.id}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrls })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "照片上傳失敗");
        return;
      }
      router.refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function onRemovePhoto(index: number) {
    if (!confirm("確定要移除這張照片？")) return;
    setUploadingPhoto(true);
    setError("");
    const response = await fetch(`/api/meals/${meal.id}/image?i=${index}`, { method: "DELETE" });
    setUploadingPhoto(false);
    if (!response.ok) {
      setError("移除照片失敗");
      return;
    }
    router.refresh();
  }

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

  // Re-log the same items as a fresh meal at the current time — the common case
  // of eating the same thing again (e.g. the usual lunchbox) without re-shooting.
  async function onRepeat() {
    if (!confirm("以相同內容新增一筆餐點到現在？")) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mealType: meal.mealType,
        eatenAt: new Date().toISOString(),
        manualItems: meal.items.map((item) => ({
          name: item.name,
          estimatedAmount: item.estimatedAmount || "未估算",
          calories: Number(item.calories) || 0,
          protein: Number(item.protein) || 0,
          fat: Number(item.fat) || 0,
          carbs: Number(item.carbs) || 0,
          aiRating: ["GOOD", "OK", "LIMIT", "MANUAL"].includes(item.aiRating) ? item.aiRating : "MANUAL"
        }))
      })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "再記一次失敗");
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
    <article className="glass glass-lift rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{MEAL_TYPE_LABELS[meal.mealType] ?? meal.mealType}</p>
          <p className="text-sm text-stone-500">{formatMealTime(meal.eatenAt)} · {meal.totalCalories} kcal</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-sm">
          {!editing ? (
            <button className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700" disabled={loading} onClick={onRepeat} type="button">
              再記一次
            </button>
          ) : null}
          <button className="rounded-full bg-stone-100 px-3 py-1 font-semibold" disabled={loading} onClick={() => setEditing((value) => !value)} type="button">
            {editing ? "取消" : "修正"}
          </button>
          <button className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700" disabled={loading} onClick={onDelete} type="button">
            刪除
          </button>
        </div>
      </div>
      <div className="mt-3">
        {imageUrls.length === 1 ? (
          <div className="group relative">
            <img alt="餐點照片" className="max-h-72 w-full rounded-2xl object-cover" src={imageUrls[0]} />
            <button
              aria-label="移除照片"
              className="absolute right-2 top-2 rounded-full bg-stone-950/70 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={uploadingPhoto}
              onClick={() => onRemovePhoto(0)}
              type="button"
            >
              ✕
            </button>
          </div>
        ) : imageUrls.length > 1 ? (
          // Multiple images: a horizontally scrollable strip so every photo shows.
          <div className="flex snap-x gap-2 overflow-x-auto pb-1">
            {imageUrls.map((url, i) => (
              <div className="group relative flex-none" key={url}>
                <img alt={`餐點照片 ${i + 1}`} className="h-44 w-44 snap-start rounded-2xl object-cover" src={url} />
                <button
                  aria-label={`移除照片 ${i + 1}`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-stone-950/70 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={uploadingPhoto}
                  onClick={() => onRemovePhoto(i)}
                  type="button"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {imageUrls.length < MAX_IMAGES ? (
          <button
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700 disabled:opacity-60"
            disabled={uploadingPhoto}
            onClick={() => photoInputRef.current?.click()}
            type="button"
          >
            {uploadingPhoto ? "上傳中..." : imageUrls.length ? "+ 新增照片" : "📷 補上傳照片"}
          </button>
        ) : null}
        <input
          ref={photoInputRef}
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          type="file"
          onChange={(event) => {
            onAddPhotos(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {editing ? (
        <form className="mt-4 space-y-3" onSubmit={onSave}>
          <label className="block">
            <span className="text-xs font-semibold text-stone-500">餐期</span>
            <select className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2" name="mealType" defaultValue={meal.mealType}>
              {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {items.map((item, index) => (
            <div className="rounded-xl bg-stone-50 p-3" key={item.clientId}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold">食物 {index + 1}</p>
                <button className="text-sm font-semibold text-red-600 disabled:text-stone-300" disabled={items.length === 1} onClick={() => setItems((values) => values.filter((value) => value.clientId !== item.clientId))} type="button">刪除此項</button>
              </div>
              <input className="w-full rounded-lg border border-stone-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "name", event.target.value)} placeholder="食物名稱" value={item.name} />
              <input className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "estimatedAmount", event.target.value)} placeholder="份量" value={item.estimatedAmount} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="rounded-lg border border-stone-200 px-3 py-2" inputMode="decimal" onChange={(event) => updateItem(item.clientId, "calories", event.target.value)} placeholder="熱量" step="0.1" type="number" value={item.calories} />
                <input className="rounded-lg border border-stone-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "protein", event.target.value)} placeholder="蛋白質" step="0.1" type="number" value={item.protein} />
                <input className="rounded-lg border border-stone-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "fat", event.target.value)} placeholder="脂肪" step="0.1" type="number" value={item.fat} />
                <input className="rounded-lg border border-stone-200 px-3 py-2" onChange={(event) => updateItem(item.clientId, "carbs", event.target.value)} placeholder="碳水" step="0.1" type="number" value={item.carbs} />
              </div>
            </div>
          ))}
          <button className="w-full rounded-xl border border-dashed border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setItems((values) => [...values, emptyEditableItem()])} type="button">新增食物品項</button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="w-full rounded-xl bg-amber-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60" disabled={loading} type="submit">
            儲存餐期與餐點
          </button>
        </form>
      ) : (
        <>
          <ul className="mt-3 grid gap-3">
            {meal.items.map((item) => (
              <li className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.7)" }} key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-stone-900"><RatingBadge rating={item.aiRating} /> {item.name}</p>
                    <p className="mt-1 text-xs text-stone-500">份量：{item.estimatedAmount}</p>
                  </div>
                  <p className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-700 shadow-sm">{item.calories} kcal</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-sky-700">{Number(item.protein).toFixed(1)}g</p>
                    <p className="text-stone-500">蛋白質</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-amber-700">{Number(item.fat).toFixed(1)}g</p>
                    <p className="text-stone-500">脂肪</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-rose-600">{Number(item.carbs).toFixed(1)}g</p>
                    <p className="text-stone-500">碳水</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <MacroBars protein={Number(meal.totalProtein)} fat={Number(meal.totalFat)} carbs={Number(meal.totalCarbs)} />
          {meal.aiNotes ? <p className="mt-3 text-xs text-stone-500">{meal.aiNotes}</p> : null}
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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("無法讀取圖片檔案"));
    reader.readAsDataURL(file);
  });
}

function formatMealTime(eatenAt: string) {
  return new Date(eatenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      <div className="flex h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="bg-sky-500" style={{ width: `${proteinPercent}%` }} />
        <div className="bg-amber-500" style={{ width: `${fatPercent}%` }} />
        <div className="bg-rose-500" style={{ width: `${carbsPercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-stone-500">蛋白質 {protein.toFixed(1)}g · 脂肪 {fat.toFixed(1)}g · 碳水 {carbs.toFixed(1)}g</p>
    </div>
  );
}
