"use client";

import { useCallback, useEffect, useState } from "react";
import type { InsightPeriod, InsightSnapshot } from "@/lib/insights";

type Props = { initialDate: string; timeZone: string };
type ChartKey = "calories" | "protein" | "fat" | "carbs";

const METRICS: { key: ChartKey; label: string; unit: string; color: string }[] = [
  { key: "protein", label: "蛋白質", unit: "g", color: "#1687a7" },
  { key: "fat", label: "脂肪", unit: "g", color: "#d58a18" },
  { key: "carbs", label: "碳水", unit: "g", color: "#d66a5c" }
];

export function InsightsDashboard({ initialDate, timeZone }: Props) {
  const [period, setPeriod] = useState<InsightPeriod>("week");
  const [date, setDate] = useState(initialDate);
  const [snapshot, setSnapshot] = useState<InsightSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ period, date, tz: timeZone });
      const response = await fetch(`/api/insights?${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "趨勢資料讀取失敗");
      setSnapshot(data as InsightSnapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "趨勢資料讀取失敗");
    } finally {
      setLoading(false);
    }
  }, [date, period, timeZone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Loading state resets when the selected date or period changes.
    void load();
  }, [load]);

  function shiftPeriod(amount: number) {
    const [year, month, day] = date.split("-").map(Number);
    const next = period === "week"
      ? new Date(Date.UTC(year, month - 1, day + amount * 7))
      : new Date(Date.UTC(year, month - 1 + amount, 1));
    setDate(next.toISOString().slice(0, 10));
  }

  const days = snapshot?.days ?? [];
  const loggedDays = days.filter((day) => day.mealCount > 0);
  const average = (key: ChartKey) => days.length
    ? days.reduce((sum, day) => sum + day[key], 0) / days.length
    : 0;
  const withinGoal = loggedDays.filter((day) => day.calories <= (snapshot?.targetCalories ?? 0)).length;
  const averageCalories = average("calories");
  const goalPercent = snapshot?.targetCalories
    ? Math.round((averageCalories / snapshot.targetCalories) * 100)
    : 0;
  const rangeTitle = snapshot
    ? `${snapshot.startDate} — ${previousDate(snapshot.endDateExclusive)}`
    : date;

  return (
    <div className="insights-page">
      <header className="insights-header">
        <div>
          <p className="dashboard-eyebrow">NUTRITION & BODY TRENDS</p>
          <h1>趨勢洞察</h1>
          <p className="insights-description">用每日紀錄看見飲食與體重的變化。</p>
        </div>
        <div className="insights-controls" aria-label="趨勢區間設定">
          <div className="insights-period-toggle" role="group" aria-label="選擇趨勢區間">
            <button type="button" className={period === "week" ? "is-active" : ""} aria-pressed={period === "week"} onClick={() => setPeriod("week")}>週</button>
            <button type="button" className={period === "month" ? "is-active" : ""} aria-pressed={period === "month"} onClick={() => setPeriod("month")}>月</button>
          </div>
          <button className="insights-period-arrow" type="button" onClick={() => shiftPeriod(-1)} aria-label="上一個區間">‹</button>
          <strong className="insights-range-title">{rangeTitle}</strong>
          <button className="insights-period-arrow" type="button" onClick={() => shiftPeriod(1)} aria-label="下一個區間">›</button>
          <input aria-label="選擇日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <button className="insights-today-button" type="button" onClick={() => setDate(initialDate)}>今天</button>
        </div>
      </header>

      {error ? <div className="insights-message is-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>重試</button></div> : null}
      {loading && !snapshot ? <div className="insights-message" role="status">正在載入趨勢資料…</div> : null}
      {!loading && !error && !loggedDays.length ? (
        <div className="insights-message" role="status">這段期間尚無飲食紀錄。開始記錄餐點後，熱量與營養素趨勢會顯示在這裡。</div>
      ) : null}

      {snapshot ? (
        <>
          <section className="insights-summary-grid" aria-label="區間摘要">
            <SummaryCard label="每日平均熱量" value={loggedDays.length ? `${Math.round(averageCalories).toLocaleString()} kcal` : "—"} note={`每日目標 ${snapshot.targetCalories.toLocaleString()} kcal`} />
            <SummaryCard label="平均目標進度" value={loggedDays.length ? `${goalPercent}%` : "—"} note="以整個區間的日平均計算" />
            <SummaryCard label="目標內天數" value={loggedDays.length ? `${withinGoal} / ${loggedDays.length}` : "—"} note="僅計算有飲食紀錄的日子" />
            <SummaryCard label="每日平均三大營養素" value={`${average("protein").toFixed(1)} / ${average("fat").toFixed(1)} / ${average("carbs").toFixed(1)} g`} note="蛋白質 / 脂肪 / 碳水" compact />
          </section>

          <section className="insights-card insights-calorie-card" aria-labelledby="insights-calorie-heading">
            <div className="insights-section-heading">
              <div><p className="dashboard-eyebrow">DAILY CALORIES</p><h2 id="insights-calorie-heading">熱量目標達成</h2></div>
              <div className="insights-legend"><span className="is-within" />目標內 <span className="is-over" />超標 <span className="is-empty" />無紀錄</div>
            </div>
            <p className="insights-card-description">每天的攝取量與每日目標比較；低於目標仍視為目標內。</p>
            <TrendBars days={days} metric="calories" target={snapshot.targetCalories} color="#596b32" period={period} />
            <div className="insights-chart-footnote">目標 {snapshot.targetCalories.toLocaleString()} kcal / 日 · {loggedDays.length} 個有紀錄日</div>
          </section>

          <section className="insights-macro-grid" aria-label="三大營養素趨勢">
            {METRICS.map((metric) => (
              <article className="insights-card insights-macro-card" key={metric.key}>
                <div className="insights-section-heading"><div><p className="dashboard-eyebrow">DAILY MACROS</p><h2>{metric.label}</h2></div><strong>{average(metric.key).toFixed(1)} <small>{metric.unit} / 日</small></strong></div>
                <TrendBars days={days} metric={metric.key} color={metric.color} period={period} />
              </article>
            ))}
          </section>

          <section className="insights-card insights-weight-card" aria-labelledby="insights-weight-heading">
            <div className="insights-section-heading">
              <div><p className="dashboard-eyebrow">BODY WEIGHT</p><h2 id="insights-weight-heading">體重變化</h2></div>
              {snapshot.weightPoints.length ? <strong className="insights-weight-latest">最新 {snapshot.weightPoints[snapshot.weightPoints.length - 1].value.toFixed(1)} kg</strong> : null}
            </div>
            {snapshot.weightPoints.length ? <WeightTrend points={snapshot.weightPoints} timeZone={timeZone} /> : <p className="insights-empty-chart">這段期間沒有體重紀錄。連結健康資料或新增體重紀錄後，趨勢會顯示在這裡。</p>}
          </section>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, note, compact = false }: { label: string; value: string; note: string; compact?: boolean }) {
  return <article className="insights-summary-card"><p>{label}</p><strong className={compact ? "is-compact" : ""}>{value}</strong><small>{note}</small></article>;
}

function TrendBars({ days, metric, color, period, target }: { days: InsightSnapshot["days"]; metric: ChartKey; color: string; period: InsightPeriod; target?: number }) {
  const maxValue = Math.max(target ?? 0, ...days.map((day) => day[metric]), 1);
  return (
    <div className={`insights-chart-wrap${period === "month" ? " is-month" : ""}`}>
      <div className="insights-bars-plot">
        {target ? <div className="insights-goal-rule" style={{ bottom: `${Math.min(target / maxValue, 1) * 100}%` }}><span>目標</span></div> : null}
        <div className="insights-bars" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day, index) => {
            const amount = day[metric];
            const status = !day.mealCount ? "is-empty" : target && amount > target ? "is-over" : "is-within";
            const label = period === "week" || index === 0 || index % 7 === 0 || index === days.length - 1 ? Number(day.date.slice(8)) : "";
            return (
              <div className="insights-bar-column" key={day.date}>
                <div className={`insights-bar ${status}`} style={{ height: `${Math.max(amount ? (amount / maxValue) * 100 : 0, amount ? 2 : 0)}%`, backgroundColor: status === "is-empty" ? undefined : color }} title={`${day.date} · ${amount.toFixed(metric === "calories" ? 0 : 1)}${metric === "calories" ? " kcal" : " g"}${target ? amount > target ? " · 超標" : " · 目標內" : ""}`} />
                <small>{label}</small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeightTrend({ points, timeZone }: { points: InsightSnapshot["weightPoints"]; timeZone: string }) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(max * 0.02, 1);
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? 320 : 24 + (index / (points.length - 1)) * 592,
    y: 150 - ((point.value - min) / spread) * 112,
    point
  }));
  const latest = points[points.length - 1];
  const dateLabel = (at: string) => new Intl.DateTimeFormat("zh-TW", { timeZone, month: "numeric", day: "numeric" }).format(new Date(at));
  return (
    <div className="insights-weight-chart">
      <svg viewBox="0 0 640 180" role="img" aria-label={`體重從 ${values[0].toFixed(1)} 公斤變化至 ${latest.value.toFixed(1)} 公斤`} preserveAspectRatio="none">
        {[0, 1, 2].map((line) => <line key={line} x1="20" x2="620" y1={38 + line * 56} y2={38 + line * 56} className="insights-grid-line" />)}
        {coordinates.length > 1 ? <polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")} className="insights-weight-line" /> : null}
        {coordinates.map(({ x, y, point }) => <circle key={point.at} cx={x} cy={y} r="4.5" className="insights-weight-dot"><title>{`${dateLabel(point.at)} · ${point.value.toFixed(1)} kg`}</title></circle>)}
      </svg>
      <div className="insights-weight-labels"><span>{dateLabel(points[0].at)} · {points[0].value.toFixed(1)} kg</span><span>{dateLabel(latest.at)} · {latest.value.toFixed(1)} kg</span></div>
    </div>
  );
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
