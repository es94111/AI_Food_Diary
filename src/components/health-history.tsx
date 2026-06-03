"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Tap-to-drill-down history for the health dashboard. A tile (鍵入 STEPS, WEIGHT…)
// opens a modal that fetches that metric's recent readings from
// /api/health/history and charts them. Sleep is special: tapping any sleep tile
// shows every sleep stage together (stacked per night).

export type HistoryMetric = { type: string; label: string; emoji: string; digits: number; sleep: boolean };
export type HistoryRequest = { title: string; emoji: string; sleep: boolean; metrics: HistoryMetric[] };

type Series = { type: string; unit: string; points: { at: string; value: number }[] };

type Ctx = { open: (request: HistoryRequest) => void };
const HistoryContext = createContext<Ctx | null>(null);

export function useHealthHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("useHealthHistory must be used within HealthHistoryProvider");
  return ctx;
}

export function HealthHistoryProvider({ tz, children }: { tz: string; children: ReactNode }) {
  const [request, setRequest] = useState<HistoryRequest | null>(null);
  const open = useCallback((next: HistoryRequest) => setRequest(next), []);
  return (
    <HistoryContext.Provider value={{ open }}>
      {children}
      {request ? <HistoryModal request={request} tz={tz} onClose={() => setRequest(null)} /> : null}
    </HistoryContext.Provider>
  );
}

// A metric tile, rendered as a button so it can launch its own history. `payload`
// is what the modal should show — a single metric, or all sleep stages.
export function HistoryTrigger({
  payload,
  className,
  children
}: {
  payload: HistoryRequest;
  className?: string;
  children: ReactNode;
}) {
  const { open } = useHealthHistory();
  return (
    <button
      type="button"
      onClick={() => open(payload)}
      className={`w-full cursor-pointer text-left transition-transform active:scale-[0.98] ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

// ---- Modal ----

function HistoryModal({ request, tz, onClose }: { request: HistoryRequest; tz: string; onClose: () => void }) {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const types = request.metrics.map((m) => m.type).join(",");
    fetch(`/api/health/history?types=${encodeURIComponent(types)}&limit=30`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "讀取失敗");
        return data.series as Series[];
      })
      .then((data) => {
        if (active) setSeries(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "讀取失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  const hasData = series?.some((s) => s.points.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] p-6 sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{request.emoji}</span>
            <h3 className="text-lg font-black">{request.title}歷史數據</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-stone-500 hover:bg-black/10"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-500">最近 {30} 筆紀錄</p>

        <div className="mt-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-stone-400">載入中…</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-rose-600">{error}</p>
          ) : !hasData ? (
            <p className="py-10 text-center text-sm text-stone-400">尚無歷史數據</p>
          ) : request.sleep ? (
            <SleepHistory series={series!} tz={tz} />
          ) : (
            <MetricHistory metric={request.metrics[0]} series={series![0]} tz={tz} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----

function dayLabel(at: string, tz: string) {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: tz, month: "numeric", day: "numeric" }).format(new Date(at));
}

function fmtSleep(mins: number) {
  const total = Math.round(mins);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function fmtValue(metric: HistoryMetric, unit: string, value: number) {
  if (metric.sleep) return fmtSleep(value);
  return `${value.toFixed(metric.digits)} ${unit}`.trim();
}

// ---- Single-metric view: bar chart + stats + reading list ----

function MetricHistory({ metric, series, tz }: { metric: HistoryMetric; series: Series; tz: string }) {
  const points = series.points;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, metric.sleep ? 1 : 0) || 1;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const stat = (label: string, value: number) => (
    <div className="rounded-xl bg-black/[0.03] p-2 text-center">
      <p className="text-sm font-black text-stone-800">{fmtValue(metric, series.unit, value)}</p>
      <p className="text-[10px] text-stone-500">{label}</p>
    </div>
  );

  return (
    <div>
      <div className="flex h-36 items-end gap-1">
        {points.map((p) => (
          <div key={p.at} className="flex h-full flex-1 items-end" title={`${dayLabel(p.at, tz)} · ${fmtValue(metric, series.unit, p.value)}`}>
            <div
              className="w-full rounded-t-sm bg-sky-400/80"
              style={{ height: `${Math.max((p.value / max) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-400">
        <span>{dayLabel(points[0].at, tz)}</span>
        {points.length > 2 ? <span>{dayLabel(points[Math.floor(points.length / 2)].at, tz)}</span> : null}
        <span>{dayLabel(points[points.length - 1].at, tz)}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {stat("平均", avg)}
        {stat("最高", Math.max(...values))}
        {stat("最新", values[values.length - 1])}
      </div>

      <div className="mt-4 max-h-48 space-y-1 overflow-y-auto">
        {[...points].reverse().map((p) => (
          <div key={p.at} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm odd:bg-black/[0.02]">
            <span className="text-stone-500">{dayLabel(p.at, tz)}</span>
            <span className="font-bold text-stone-800">{fmtValue(metric, series.unit, p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Sleep view: all stages stacked per night ----

const SLEEP_STAGES = [
  { type: "SLEEP_DEEP", label: "深睡", color: "#4338ca" },
  { type: "SLEEP_LIGHT", label: "淺睡", color: "#818cf8" },
  { type: "SLEEP_REM", label: "REM", color: "#c4b5fd" },
  { type: "SLEEP_AWAKE", label: "清醒", color: "#fcd34d" }
];

function SleepHistory({ series, tz }: { series: Series[]; tz: string }) {
  const byType = new Map(series.map((s) => [s.type, s]));
  // Union of every date that has any sleep reading, oldest→newest.
  const dates = new Map<string, string>(); // dayKey -> a representative ISO instant
  for (const s of series) for (const p of s.points) dates.set(dayLabel(p.at, tz), p.at);
  const ordered = [...dates.entries()].sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]));

  // Per-date stage minutes, keyed by day label.
  const stageByDate = new Map<string, Record<string, number>>();
  for (const stage of SLEEP_STAGES) {
    const s = byType.get(stage.type);
    if (!s) continue;
    for (const p of s.points) {
      const key = dayLabel(p.at, tz);
      const entry = stageByDate.get(key) ?? {};
      entry[stage.type] = p.value;
      stageByDate.set(key, entry);
    }
  }
  // Total per night: prefer the SLEEP series, else sum of stages.
  const totalSeries = byType.get("SLEEP");
  const totalByDate = new Map<string, number>();
  if (totalSeries) for (const p of totalSeries.points) totalByDate.set(dayLabel(p.at, tz), p.value);
  const nightTotal = (label: string) => {
    if (totalByDate.has(label)) return totalByDate.get(label)!;
    const e = stageByDate.get(label) ?? {};
    return SLEEP_STAGES.reduce((s, st) => s + (e[st.type] ?? 0), 0);
  };

  const hasStages = stageByDate.size > 0;
  const maxTotal = Math.max(...ordered.map(([label]) => nightTotal(label)), 1);

  return (
    <div>
      <div className="flex h-36 items-end gap-1">
        {ordered.map(([label, iso]) => {
          const total = nightTotal(label);
          const colHeight = Math.max((total / maxTotal) * 100, 2);
          const entry = stageByDate.get(label) ?? {};
          return (
            <div key={iso} className="flex h-full flex-1 items-end" title={`${label} · ${fmtSleep(total)}`}>
              <div className="flex w-full flex-col overflow-hidden rounded-t-sm" style={{ height: `${colHeight}%` }}>
                {hasStages
                  ? // Top→bottom: awake, rem, light, deep (deep at the base).
                    [...SLEEP_STAGES].reverse().map((stage) => {
                      const v = entry[stage.type] ?? 0;
                      if (v <= 0 || total <= 0) return null;
                      return <div key={stage.type} style={{ height: `${(v / total) * 100}%`, background: stage.color }} />;
                    })
                  : <div className="h-full bg-indigo-400/80" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-400">
        <span>{ordered[0][0]}</span>
        {ordered.length > 2 ? <span>{ordered[Math.floor(ordered.length / 2)][0]}</span> : null}
        <span>{ordered[ordered.length - 1][0]}</span>
      </div>

      {hasStages ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {SLEEP_STAGES.map((stage) => (
            <span key={stage.type} className="flex items-center gap-1 text-[11px] text-stone-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: stage.color }} />
              {stage.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 max-h-56 space-y-1 overflow-y-auto">
        {[...ordered].reverse().map(([label, iso]) => {
          const entry = stageByDate.get(label) ?? {};
          return (
            <div key={iso} className="rounded-lg px-2 py-1.5 text-sm odd:bg-black/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">{label}</span>
                <span className="font-bold text-stone-800">{fmtSleep(nightTotal(label))}</span>
              </div>
              {hasStages ? (
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-stone-400">
                  {SLEEP_STAGES.map((stage) =>
                    entry[stage.type] ? (
                      <span key={stage.type}>
                        {stage.label} {fmtSleep(entry[stage.type])}
                      </span>
                    ) : null
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
