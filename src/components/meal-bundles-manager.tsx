"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type BundleItem = {
  savedFoodId?: string | null;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  aiRating?: string;
};

type MealBundle = {
  id: string;
  name: string;
  hasImage: boolean;
  imageUrl: string | null;
  items: BundleItem[];
};

type FoodOption = {
  id: string;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type DraftItem = BundleItem & { clientId: string };
type Draft = { id?: string; name: string; items: DraftItem[]; imageUrl: string | null; imageDataUrl?: string; removeImage?: boolean };

function newItem(): DraftItem {
  return { clientId: crypto.randomUUID(), name: "", estimatedAmount: "", calories: 0, protein: 0, fat: 0, carbs: 0, aiRating: "MANUAL" };
}

function emptyDraft(): Draft {
  return { name: "", items: [newItem()], imageUrl: null };
}

function draftFor(bundle: MealBundle): Draft {
  return {
    id: bundle.id,
    name: bundle.name,
    imageUrl: bundle.imageUrl,
    items: bundle.items.map((item) => ({ ...item, clientId: crypto.randomUUID() }))
  };
}

export function MealBundlesManager({ initialBundles, foods }: { initialBundles: MealBundle[]; foods: FoodOption[] }) {
  const router = useRouter();
  const [bundles, setBundles] = useState(initialBundles);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateItem(clientId: string, field: keyof BundleItem, value: string | number | null) {
    setDraft((current) => current && ({
      ...current,
      items: current.items.map((item) => item.clientId === clientId ? { ...item, [field]: value } : item)
    }));
  }

  function chooseFood(clientId: string, savedFoodId: string) {
    const food = foods.find((entry) => entry.id === savedFoodId);
    if (!food) {
      updateItem(clientId, "savedFoodId", null);
      return;
    }
    setDraft((current) => current && ({
      ...current,
      items: current.items.map((item) => item.clientId === clientId ? {
        ...item,
        savedFoodId: food.id,
        name: food.name,
        estimatedAmount: food.estimatedAmount,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs
      } : item)
    }));
  }

  async function onImageChange(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) {
      setError("請選擇 6 MB 以下的圖片檔案。");
      return;
    }
    const imageDataUrl = await fileToDataUrl(file);
    setDraft((current) => current && ({ ...current, imageDataUrl, imageUrl: imageDataUrl, removeImage: false }));
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const items = draft.items.filter((item) => item.name.trim()).map(({ clientId: _clientId, ...item }) => ({
      ...item,
      name: item.name.trim(),
      estimatedAmount: item.estimatedAmount.trim() || "未估算"
    }));
    if (!draft.name.trim() || items.length === 0) {
      setError("請輸入餐組名稱，並至少保留一項食物。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(draft.id ? `/api/meal-bundles/${draft.id}` : "/api/meal-bundles", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          items,
          imageDataUrl: draft.imageDataUrl,
          removeImage: draft.removeImage
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "餐組儲存失敗。");
        return;
      }
      const saved = data.bundle as MealBundle;
      setBundles((current) => draft.id
        ? current.map((bundle) => bundle.id === saved.id ? saved : bundle)
        : [saved, ...current]);
      setDraft(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "餐組儲存失敗。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(bundle: MealBundle) {
    if (!confirm(`確定刪除「${bundle.name}」？`)) return;
    const response = await fetch(`/api/meal-bundles/${bundle.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "刪除餐組失敗。");
      return;
    }
    setBundles((current) => current.filter((entry) => entry.id !== bundle.id));
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">將常吃的多項食物存成一組，下次記錄時可一次加入並繼續修改。</p>
        <button className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => { setDraft(emptyDraft()); setError(""); }} type="button">新增餐組</button>
      </div>
      {error && !draft ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {draft ? (
        <form className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200" onSubmit={save}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">{draft.id ? "編輯餐組" : "新增餐組"}</h2>
            <button className="text-sm font-semibold text-stone-600" onClick={() => setDraft(null)} type="button">取消</button>
          </div>
          <label className="block text-sm font-semibold">餐組名稱
            <input className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2" maxLength={120} onChange={(event) => setDraft((current) => current && ({ ...current, name: event.target.value }))} required value={draft.name} />
          </label>
          <div className="rounded-xl border border-dashed border-stone-300 p-3">
            <label className="block text-sm font-semibold">照片（選填）
              <input accept="image/*" className="mt-2 block w-full text-sm" onChange={(event) => { void onImageChange(event.target.files?.[0]); event.target.value = ""; }} type="file" />
            </label>
            {draft.imageUrl ? <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Preview sources may be local data URLs or authenticated API routes. */}
              <img alt="餐組照片預覽" className="h-20 w-20 rounded-xl object-cover" src={draft.imageUrl} />
              <button className="text-sm font-semibold text-red-700" onClick={() => setDraft((current) => current && ({ ...current, imageUrl: null, imageDataUrl: undefined, removeImage: true }))} type="button">移除照片</button>
            </div> : null}
          </div>
          <div className="space-y-3">
            <h3 className="font-bold">食物項目</h3>
            {draft.items.map((item, index) => (
              <div className="rounded-xl bg-stone-50 p-3" key={item.clientId}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold">項目 {index + 1}</p>
                  <button className="text-sm font-semibold text-red-700 disabled:text-stone-400" disabled={draft.items.length === 1} onClick={() => setDraft((current) => current && ({ ...current, items: current.items.filter((entry) => entry.clientId !== item.clientId) }))} type="button">移除</button>
                </div>
                <label className="block text-xs font-semibold text-stone-600">從我的食物選擇（選填）
                  <select className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" onChange={(event) => chooseFood(item.clientId, event.target.value)} value={item.savedFoodId ?? ""}>
                    <option value="">自訂食物</option>
                    {foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.estimatedAmount}</option>)}
                  </select>
                </label>
                <input aria-label={`項目 ${index + 1} 名稱`} className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2" maxLength={120} onChange={(event) => updateItem(item.clientId, "name", event.target.value)} placeholder="食物名稱" value={item.name} />
                <input aria-label={`項目 ${index + 1} 份量`} className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2" maxLength={120} onChange={(event) => updateItem(item.clientId, "estimatedAmount", event.target.value)} placeholder="份量，例如 1 碗" value={item.estimatedAmount} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["calories", "protein", "fat", "carbs"] as const).map((field) => <label className="text-xs text-stone-600" key={field}>{field === "calories" ? "熱量 kcal" : field === "protein" ? "蛋白質 g" : field === "fat" ? "脂肪 g" : "碳水 g"}
                    <input className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm" min="0" onChange={(event) => updateItem(item.clientId, field, Number(event.target.value))} step="any" type="number" value={item[field]} />
                  </label>)}
                </div>
              </div>
            ))}
            <button className="w-full rounded-xl border border-dashed border-stone-300 px-3 py-2 text-sm font-semibold" onClick={() => setDraft((current) => current && ({ ...current, items: [...current.items, newItem()] }))} type="button">新增食物項目</button>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button className="w-full rounded-xl bg-amber-700 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? "儲存中…" : "儲存餐組"}</button>
        </form>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {bundles.map((bundle) => <article className="rounded-2xl bg-white p-4 ring-1 ring-stone-200" key={bundle.id}>
          <div className="flex gap-3">
            {bundle.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Stored image URLs can be authenticated API routes.
              <img alt="" className="h-16 w-16 rounded-xl object-cover" src={bundle.imageUrl} />
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{bundle.name}</h2>
              <p className="mt-1 text-sm text-stone-600">{bundle.items.length} 項 · {bundle.items.reduce((sum, item) => sum + Number(item.calories), 0)} kcal</p>
              <p className="mt-1 line-clamp-2 text-xs text-stone-500">{bundle.items.map((item) => item.name).join("、")}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800" onClick={() => { setDraft(draftFor(bundle)); setError(""); }} type="button">編輯</button>
            <button className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700" onClick={() => void remove(bundle)} type="button">刪除</button>
          </div>
        </article>)}
      </div>
      {!bundles.length ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-500">尚未建立餐組。</p> : null}
    </section>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("無法讀取圖片檔案。"));
    reader.readAsDataURL(file);
  });
}
