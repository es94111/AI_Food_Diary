"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  createdAt?: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
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

function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

type FoodDraft = Omit<SavedFood, "id" | "useCount" | "lastUsedAt" | "createdAt" | "updatedAt" | "archivedAt"> & { id?: string };
type FoodTab = "favorites" | "all" | "barcoded" | "recent" | "unused" | "duplicates" | "incomplete" | "archived";
type SortMode = "smart" | "recent" | "frequent" | "name" | "created";
type ConflictMatch = { food: SavedFood; archived?: boolean; reason?: string; score?: number };
type ConflictState = { exact: ConflictMatch | null; matches: ConflictMatch[] };

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
  { id: "all", label: "全部" },
  { id: "barcoded", label: "有條碼" },
  { id: "recent", label: "最近使用" },
  { id: "unused", label: "未使用" },
  { id: "duplicates", label: "可能重複" },
  { id: "incomplete", label: "資料不完整" },
  { id: "archived", label: "已封存" }
];

const sortLabels: Record<SortMode, string> = {
  smart: "智慧排序",
  recent: "最近使用",
  frequent: "最常使用",
  name: "名稱 A–Z",
  created: "最近建立"
};

function sortFoods(items: SavedFood[], sort: SortMode) {
  return [...items].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "zh-Hant");
    if (sort === "recent") return (Date.parse(b.lastUsedAt ?? "") || 0) - (Date.parse(a.lastUsedAt ?? "") || 0);
    if (sort === "frequent") return (b.useCount ?? 0) - (a.useCount ?? 0) || a.name.localeCompare(b.name, "zh-Hant");
    if (sort === "created") return (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0);
    return Number(!!b.isFavorite) - Number(!!a.isFavorite)
      || (Date.parse(b.lastUsedAt ?? "") || 0) - (Date.parse(a.lastUsedAt ?? "") || 0)
      || (b.useCount ?? 0) - (a.useCount ?? 0)
      || (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0);
  });
}

function duplicateFoodIds(foods: SavedFood[]) {
  const groups = new Map<string, string[]>();
  for (const food of foods) {
    const key = normalizeSearch(food.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), food.id]);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}

function isIncompleteFood(food: SavedFood) {
  return !food.name.trim() || !food.estimatedAmount.trim()
    || [food.calories, food.protein, food.fat, food.carbs].every((value) => Number(value) <= 0);
}

export function SavedFoodsManager({ initialFoods }: { initialFoods: SavedFood[] }) {
  const [foods, setFoods] = useState(initialFoods);
  const [archivedFoods, setArchivedFoods] = useState<SavedFood[]>([]);
  const [draft, setDraft] = useState<FoodDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FoodTab>("favorites");
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renderLimit, setRenderLimit] = useState(30);

  const loadFoods = useCallback(async () => {
    const response = await fetch("/api/saved-foods", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setFoods(data.foods ?? []);
  }, []);

  const loadArchived = useCallback(async () => {
    const response = await fetch("/api/saved-foods?archived=true", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setArchivedFoods(data.foods ?? []);
      setArchivedLoaded(true);
    }
  }, []);

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") {
        void loadFoods();
        if (archivedLoaded) void loadArchived();
      }
    };
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("focus", reload);
    return () => {
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("focus", reload);
    };
  }, [archivedLoaded, loadArchived, loadFoods]);

  useEffect(() => {
    if (activeTab === "archived" && !archivedLoaded) void loadArchived();
  }, [activeTab, archivedLoaded, loadArchived]);

  const sourceFoods = activeTab === "archived" ? archivedFoods : foods;
  const duplicateIds = useMemo(() => duplicateFoodIds(foods), [foods]);
  const smartCounts = useMemo(() => ({
    unused: foods.filter((food) => (food.useCount ?? 0) === 0 && !food.lastUsedAt).length,
    duplicates: duplicateIds.size,
    incomplete: foods.filter(isIncompleteFood).length
  }), [duplicateIds, foods]);
  const visibleFoods = useMemo(() => {
    const query = normalizeSearch(search);
    const filtered = sourceFoods.filter((food) => {
      if (activeTab === "favorites" && !food.isFavorite) return false;
      if (activeTab === "barcoded" && !food.barcode) return false;
      if (activeTab === "recent" && !food.lastUsedAt) return false;
      if (activeTab === "unused" && ((food.useCount ?? 0) !== 0 || food.lastUsedAt)) return false;
      if (activeTab === "duplicates" && !duplicateIds.has(food.id)) return false;
      if (activeTab === "incomplete" && !isIncompleteFood(food)) return false;
      if (!query) return true;
      return normalizeSearch(food.name).includes(query) || normalizeSearch(food.barcode ?? "").includes(query);
    });
    const sorted = sortFoods(filtered, activeTab === "recent" ? "recent" : sortMode);
    return activeTab === "recent" ? sorted.slice(0, 30) : sorted;
  }, [activeTab, duplicateIds, search, sortMode, sourceFoods]);

  useEffect(() => {
    setRenderLimit(30);
    setSelectedIds(new Set());
  }, [activeTab, search, sortMode]);

  function edit(food: SavedFood) {
    setEditingId(food.id);
    setEditorOpen(true);
    setDraft({ ...food, barcode: food.barcode ?? "", source: food.source ?? "MANUAL", isFavorite: food.isFavorite ?? false });
    setDraftImage(null);
    setRemoveImage(false);
    setConflict(null);
    setError("");
  }

  function reset() {
    setEditingId(null);
    setEditorOpen(false);
    setDraft(emptyDraft);
    setDraftImage(null);
    setRemoveImage(false);
    setConflict(null);
    setSelectedIds(new Set());
    setError("");
  }

  function payloadFor(food: FoodDraft | SavedFood, override: Partial<FoodDraft> = {}, clearEmptyBarcode = false) {
    const barcode = (override.barcode ?? food.barcode)?.trim() || null;
    return {
      barcode: barcode ?? (clearEmptyBarcode ? null : undefined),
      name: (override.name ?? food.name).trim(),
      estimatedAmount: (override.estimatedAmount ?? food.estimatedAmount).trim() || "1 份",
      calories: Number(override.calories ?? food.calories ?? 0),
      protein: Number(override.protein ?? food.protein ?? 0),
      fat: Number(override.fat ?? food.fat ?? 0),
      carbs: Number(override.carbs ?? food.carbs ?? 0),
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
    const request = (allowDuplicate = false, targetId = editingId, clearBarcode = false) => fetch(targetId ? `/api/saved-foods/${targetId}` : "/api/saved-foods", {
      method: targetId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payloadFor(draft, clearBarcode ? { barcode: "" } : {}, !!targetId),
        ...(allowDuplicate ? { allowDuplicate: true } : {}),
        ...(draftImage ? { imageDataUrl: draftImage } : {}),
        ...(removeImage ? { removeImage: true } : {})
      })
    });
    try {
      let response = await request();
      let data = await response.json().catch(() => ({}));
      if (response.status === 409 && !editingId) {
        setConflict({
          exact: data.exactBarcode?.food ? data.exactBarcode as ConflictMatch : null,
          matches: Array.isArray(data.duplicates) ? data.duplicates as ConflictMatch[] : []
        });
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "儲存失敗，請稍後再試。");
        return;
      }
      const food = data.food as SavedFood;
      setFoods((current) => [food, ...current.filter((item) => item.id !== food.id)]);
      reset();
    } finally {
      setSaving(false);
    }
  }

  async function useConflict(match: ConflictMatch) {
    if (match.archived) return;
    setFoods((current) => [match.food, ...current.filter((food) => food.id !== match.food.id)]);
    reset();
  }

  async function updateConflict(match: ConflictMatch) {
    if (match.archived) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/saved-foods/${match.food.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payloadFor(draft, {}, true),
          ...(draftImage ? { imageDataUrl: draftImage } : {})
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "更新失敗，請稍後再試。");
      setFoods((current) => [data.food, ...current.filter((food) => food.id !== match.food.id)]);
      reset();
    } finally {
      setSaving(false);
    }
  }

  async function restoreConflict(match: ConflictMatch) {
    if (!match.archived) return;
    const response = await fetch(`/api/saved-foods/${match.food.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "還原失敗，請稍後再試。");
    setArchivedFoods((current) => current.filter((food) => food.id !== match.food.id));
    setFoods((current) => [data.food, ...current.filter((food) => food.id !== match.food.id)]);
    reset();
  }

  async function saveConflictAsNew() {
    setSaving(true);
    setError("");
    try {
      const exactBarcode = !!conflict?.exact;
      const response = await fetch("/api/saved-foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payloadFor(draft, exactBarcode ? { barcode: "" } : {}),
          allowDuplicate: true,
          ...(draftImage ? { imageDataUrl: draftImage } : {})
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "另存失敗，請稍後再試。");
      setFoods((current) => [data.food, ...current]);
      reset();
    } finally {
      setSaving(false);
    }
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
    if (response.ok) {
      setFoods((current) => current.filter((food) => food.id !== id));
      setSelectedIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function archiveSelected() {
    if (!selectedIds.size) return;
    const ids = [...selectedIds];
    const archivedIds = new Set<string>();
    for (let start = 0; start < ids.length; start += 100) {
      const chunk = ids.slice(start, start + 100);
      const response = await fetch("/api/saved-foods/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFoods((current) => current.filter((food) => !archivedIds.has(food.id)));
        setSelectedIds((current) => new Set([...current].filter((id) => !archivedIds.has(id))));
        return setError(data.error ?? `已封存 ${archivedIds.size} 筆，後續批次失敗，請稍後重試。`);
      }
      chunk.forEach((id) => archivedIds.add(id));
    }
    setFoods((current) => current.filter((food) => !archivedIds.has(food.id)));
    setSelectedIds((current) => new Set([...current].filter((id) => !archivedIds.has(id))));
    if (archivedLoaded) void loadArchived();
  }

  async function restore(food: SavedFood) {
    const response = await fetch(`/api/saved-foods/${food.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setArchivedFoods((current) => current.filter((item) => item.id !== food.id));
      setFoods((current) => [data.food, ...current.filter((item) => item.id !== food.id)]);
    } else setError(data.error ?? "還原失敗，請稍後再試。");
  }

  const renderedFoods = visibleFoods.slice(0, renderLimit);
  const conflictMatches = conflict
    ? (conflict.exact ? [conflict.exact] : conflict.matches).filter((match): match is ConflictMatch => !!match)
        .filter((match, index, matches) => matches.findIndex((item) => item.food.id === match.food.id) === index)
    : [];

  function tabCount(tab: FoodTab) {
    if (tab === "unused") return smartCounts.unused;
    if (tab === "duplicates") return smartCounts.duplicates;
    if (tab === "incomplete") return smartCounts.incomplete;
    if (tab === "archived") return archivedFoods.length;
    return null;
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

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input aria-label="搜尋名稱或條碼" className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="搜尋名稱或條碼" value={search} />
        <select aria-label="排序" className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setSortMode(event.target.value as SortMode)} value={sortMode}>
          {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="mt-4 rounded-2xl bg-stone-50 p-4">
        <button aria-expanded={editorOpen} className="flex w-full items-center justify-between text-left font-bold" onClick={() => { setEditorOpen((open) => !open); if (editorOpen && editingId) reset(); }} type="button">
          <span>{editingId ? "編輯食物" : "新增食物"}</span><span aria-hidden>{editorOpen ? "−" : "＋"}</span>
        </button>
        {editorOpen ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, name: event.target.value }))} placeholder="食物名稱" value={draft.name} />
          <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, barcode: event.target.value }))} placeholder="產品條碼（選填）" value={draft.barcode ?? ""} />
          <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => setDraft((v) => ({ ...v, estimatedAmount: event.target.value }))} placeholder="份量，例如 1 份 / 100g" value={draft.estimatedAmount} />
          <div className="rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-600">
            <span className="block text-xs text-stone-400">來源（唯讀）</span>
            {sourceLabels[draft.source ?? "MANUAL"]}
          </div>
          <input className="rounded-xl border border-stone-200 px-3 py-2" inputMode="decimal" min="0" onChange={(event) => setDraft((v) => ({ ...v, calories: Number(event.target.value) }))} placeholder="熱量 kcal" step="0.1" type="number" value={draft.calories} />
          <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, protein: Number(event.target.value) }))} placeholder="蛋白質 g" step="0.1" type="number" value={draft.protein} />
          <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, fat: Number(event.target.value) }))} placeholder="脂肪 g" step="0.1" type="number" value={draft.fat} />
          <input className="rounded-xl border border-stone-200 px-3 py-2" min="0" onChange={(event) => setDraft((v) => ({ ...v, carbs: Number(event.target.value) }))} placeholder="碳水 g" step="0.1" type="number" value={draft.carbs} />
          <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700"><input checked={!!draft.isFavorite} onChange={(event) => setDraft((v) => ({ ...v, isFavorite: event.target.checked }))} type="checkbox" />加入常用</label>
          <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 sm:col-span-2">
            {(() => {
              const existing = editingId && !removeImage && foods.find((f) => f.id === editingId)?.hasImage;
              const src = draftImage ?? (existing ? `/api/saved-foods/${editingId}/image` : null);
              return src ? <img alt="食物照片" className="h-16 w-16 rounded-lg object-cover" src={src} /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-400">無照片</div>;
            })()}
            <label className="cursor-pointer rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-700">上傳食物照片<input accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setDraftImage(await fileToDataUrl(file)); setRemoveImage(false); event.target.value = ""; }} type="file" /></label>
            {draftImage || (editingId && !removeImage && foods.find((f) => f.id === editingId)?.hasImage) ? <button className="text-sm font-semibold text-red-600" onClick={() => { setDraftImage(null); setRemoveImage(true); }} type="button">移除</button> : null}
          </div>
          <button className="rounded-xl bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={saving} onClick={save} type="button">{saving ? "儲存中..." : editingId ? "儲存修改" : "新增食物"}</button>
        </div> : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {conflict ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-bold text-amber-950">找到可能相同的食物</h3>
        <p className="mt-1 text-xs text-amber-800">請明確選擇要使用、更新、還原，或另存新食物。</p>
        <div className="mt-3 space-y-2">
          {conflictMatches.map((match) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3" key={match.food.id}>
            <span className="text-sm font-semibold">{match.food.name}{match.archived ? "（已封存）" : ""}</span>
            <div className="flex gap-2">
              {match.archived
                ? <button className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800" disabled={saving} onClick={() => restoreConflict(match)} type="button">還原</button>
                : <><button className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold" disabled={saving} onClick={() => useConflict(match)} type="button">使用</button><button className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900" disabled={saving} onClick={() => updateConflict(match)} type="button">更新</button></>}
            </div>
          </div>)}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="rounded-full px-3 py-1.5 text-sm font-semibold text-stone-600" onClick={() => setConflict(null)} type="button">取消</button>
          <button className="rounded-full bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white" disabled={saving} onClick={saveConflictAsNew} type="button">另存</button>
        </div>
        {conflict.exact ? <p className="mt-2 text-xs text-amber-800">精確條碼已被使用；另存時會移除新食物的條碼。</p> : null}
      </div> : null}

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-full bg-stone-100 p-1 text-sm font-semibold">
        {tabs.map((tab) => <button className={`shrink-0 rounded-full px-3 py-2 ${activeTab === tab.id ? "bg-amber-700 text-white" : "text-stone-600"}`} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}{tabCount(tab.id) === null ? "" : ` ${tabCount(tab.id)}`}</button>)}
      </div>

      {activeTab !== "archived" && selectedIds.size ? <div className="mt-3 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-sm">
        <span>已選 {selectedIds.size} 筆</span>
        <div className="flex gap-2"><button className="font-semibold text-stone-600" onClick={() => setSelectedIds(new Set())} type="button">取消</button><button className="font-semibold text-red-700" onClick={archiveSelected} type="button">批次封存</button></div>
      </div> : null}

      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {renderedFoods.length ? renderedFoods.map((food) => (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={food.id}>
            <div className="flex items-center gap-3">
              {activeTab !== "archived" ? <input aria-label={`選取 ${food.name}`} checked={selectedIds.has(food.id)} className="h-4 w-4 accent-amber-700" onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(food.id); else next.delete(food.id); return next; })} type="checkbox" /> : null}
              {food.hasImage ? <img alt={food.name} className="h-14 w-14 flex-none rounded-xl object-cover" decoding="async" loading="lazy" src={`/api/saved-foods/${food.id}/image`} /> : null}
              <div>
                <p className="font-bold text-stone-900">{food.isFavorite ? "★ " : ""}{food.name} <span className="font-normal text-stone-500">· {food.estimatedAmount}</span></p>
                <p className="mt-1 text-sm text-stone-500">{food.calories} kcal · 蛋白質 {food.protein}g · 脂肪 {food.fat}g · 碳水 {food.carbs}g{food.barcode ? ` · 條碼 ${food.barcode}` : ""}</p>
                <p className="mt-1 text-xs text-stone-400">{sourceLabels[food.source ?? "MANUAL"]} · 使用 {food.useCount ?? 0} 次{food.lastUsedAt ? ` · 上次 ${new Date(food.lastUsedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}` : ""}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeTab === "archived" ? <button className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700" onClick={() => restore(food)} type="button">還原</button> : <><button className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700" onClick={() => toggleFavorite(food)} type="button">{food.isFavorite ? "取消常用" : "設為常用"}</button><button className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold" onClick={() => edit(food)} type="button">編輯</button><button className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600" onClick={() => archive(food.id)} type="button">封存</button></>}
            </div>
          </div>
        )) : <p className="p-4 text-sm text-stone-500">這個分類目前沒有食物。</p>}
      </div>
      {renderedFoods.length < visibleFoods.length ? <button className="mt-4 w-full rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700" onClick={() => setRenderLimit((limit) => limit + 30)} type="button">載入更多（尚有 {visibleFoods.length - renderedFoods.length} 筆）</button> : null}
    </div>
  );
}
