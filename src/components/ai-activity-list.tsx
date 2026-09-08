"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ActivityEvent = {
  id: string;
  timestamp: string;
  user: { id: string; name: string | null; email: string };
  actorSource: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  mcpToolName: string | null;
  status: string;
  isRestored: boolean;
};

type ActivityPage = { events: ActivityEvent[]; nextCursor: string | null };

type Filters = {
  from: string;
  to: string;
  userId: string;
  actorSource: string;
  mcpToolName: string;
  resourceType: string;
  action: string;
  status: string;
};

const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  userId: "",
  actorSource: "",
  mcpToolName: "",
  resourceType: "",
  action: "",
  status: "",
};

function errorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null) return "無法載入 AI 操作紀錄。";
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "無法載入 AI 操作紀錄。";
}

function queryString(filters: Filters, cursor?: string): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value.trim()) continue;
    if (key === "from") {
      query.set(key, new Date(`${value}T00:00:00`).toISOString());
    } else if (key === "to") {
      const exclusiveEnd = new Date(`${value}T00:00:00`);
      exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
      query.set(key, exclusiveEnd.toISOString());
    } else {
      query.set(key, value.trim());
    }
  }
  query.set("limit", "25");
  if (cursor) query.set("cursor", cursor);
  return query.toString();
}

function displayDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-TW");
}

export function AiActivityList({ isAdmin }: { isAdmin: boolean }) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(async (cursor?: string) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-activity?${queryString(filters, cursor)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json()) as ActivityPage | unknown;
      if (!response.ok) throw new Error(errorMessage(body));
      if (generation !== loadGeneration.current) return;
      const page = body as ActivityPage;
      setEvents((current) => (cursor ? [...current, ...page.events] : page.events));
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      if (generation !== loadGeneration.current) return;
      setError(loadError instanceof Error ? loadError.message : "無法載入 AI 操作紀錄。");
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvents([]);
    setNextCursor(null);
    setFilters({ ...draft });
  }

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mt-6 space-y-5">
      <form className="glass rounded-[2rem] p-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FilterField label="開始日期">
            <input className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" type="date" value={draft.from} onChange={(e) => update("from", e.target.value)} />
          </FilterField>
          <FilterField label="結束日期">
            <input className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" type="date" value={draft.to} onChange={(e) => update("to", e.target.value)} />
          </FilterField>
          {isAdmin ? (
            <FilterField label="使用者 ID">
              <input className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" maxLength={128} value={draft.userId} onChange={(e) => update("userId", e.target.value)} />
            </FilterField>
          ) : null}
          <FilterField label="AI 來源">
            <input className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" maxLength={128} placeholder="chatgpt_mcp" value={draft.actorSource} onChange={(e) => update("actorSource", e.target.value)} />
          </FilterField>
          <FilterField label="MCP Tool">
            <input className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" maxLength={128} placeholder="create_meal" value={draft.mcpToolName} onChange={(e) => update("mcpToolName", e.target.value)} />
          </FilterField>
          <FilterField label="Resource">
            <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" value={draft.resourceType} onChange={(e) => update("resourceType", e.target.value)}>
              <option value="">全部</option>
              <option value="MEAL">Meal</option>
              <option value="SAVED_FOOD">Saved food</option>
              <option value="WATER_LOG">Water log</option>
            </select>
          </FilterField>
          <FilterField label="Action">
            <input className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" maxLength={128} placeholder="AI_CREATE_SUCCEEDED" value={draft.action} onChange={(e) => update("action", e.target.value)} />
          </FilterField>
          <FilterField label="Status">
            <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2" value={draft.status} onChange={(e) => update("status", e.target.value)}>
              <option value="">全部</option>
              <option value="started">Started</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </FilterField>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white" type="submit">套用篩選</button>
          <button
            className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold"
            type="button"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              setEvents([]);
              setNextCursor(null);
              setFilters(EMPTY_FILTERS);
            }}
          >
            清除
          </button>
        </div>
      </form>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div> : null}

      <div className="glass overflow-hidden rounded-[2rem]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-white/50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-4">時間</th>
                <th className="px-5 py-4">來源／使用者</th>
                <th className="px-5 py-4">Tool／Action</th>
                <th className="px-5 py-4">影響資料</th>
                <th className="px-5 py-4">結果</th>
                <th className="px-5 py-4"><span className="sr-only">查看</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {events.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap px-5 py-4">{displayDate(item.timestamp)}</td>
                  <td className="px-5 py-4"><strong className="block">{item.actorSource}</strong><span className="text-xs text-stone-500">{item.user.name || item.user.email}</span></td>
                  <td className="px-5 py-4"><code className="block text-xs">{item.mcpToolName || "—"}</code><span className="text-xs text-stone-500">{item.action}</span></td>
                  <td className="px-5 py-4"><span className="block">{item.resourceType}</span><code className="text-xs text-stone-500">{item.resourceId || "—"}</code></td>
                  <td className="px-5 py-4"><span className="font-semibold">{item.status}</span>{item.isRestored ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">已還原</span> : null}</td>
                  <td className="px-5 py-4"><Link className="font-semibold text-amber-800 underline-offset-4 hover:underline" href={`/dashboard/ai-activity/${encodeURIComponent(item.id)}`}>查看</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && events.length === 0 ? <p className="p-8 text-center text-stone-500">沒有符合條件的 AI 操作紀錄。</p> : null}
        <div className="flex justify-center border-t border-stone-200 p-4">
          {nextCursor ? <button className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold" disabled={loading} onClick={() => void load(nextCursor)}>{loading ? "載入中…" : "載入更多"}</button> : loading ? <span className="text-sm text-stone-500" role="status">載入中…</span> : null}
        </div>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-sm font-semibold text-stone-700"><span>{label}</span>{children}</label>;
}
