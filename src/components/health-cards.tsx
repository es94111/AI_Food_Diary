import type { ReactNode } from "react";

// Presentational pieces for the health dashboard (grouped infographic cards,
// activity rings, sleep hypnogram/bar, weight sparkline). Pure render functions
// with no client-only APIs, so they render fine inside a server component.

export type MetricValue = { value: number; unit: string; measuredAt: Date };

export function latestMetricsByType(metrics: Array<{ type: string; value: number; unit: string; measuredAt: Date }>) {
  return metrics.reduce<Record<string, MetricValue>>((latest, metric) => {
    if (!latest[metric.type]) latest[metric.type] = metric;
    return latest;
  }, {});
}

// Whether an instant falls within the user's current calendar day.
function isWithin(measuredAt: Date, start: Date, end: Date) {
  return measuredAt >= start && measuredAt < end;
}

// "6/2 14:30" in the user's zone — body-composition readings keep their exact
// timestamp since they're allowed to be older than today.
function formatMeasuredAt(measuredAt: Date, tz: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: tz,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(measuredAt);
}

function formatHealthMetric(metric: { value: number; unit: string } | undefined, digits: number) {
  if (!metric) return "尚未同步";
  return `${metric.value.toFixed(digits)} ${metric.unit}`;
}

// Sleep durations (stored in minutes) read better as H:MM.
function formatSleep(metric: { value: number } | undefined) {
  if (!metric) return "尚未同步";
  const total = Math.round(metric.value);
  const h = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// ---- Health metrics, grouped by category for the infographic layout ----

type HealthMetricDef = { type: string; label: string; emoji: string; digits?: number; sleep?: boolean };
type HealthAccent = "amber" | "sky" | "rose" | "indigo" | "emerald";
type HealthGroup = { id: string; title: string; emoji: string; accent: HealthAccent; metrics: HealthMetricDef[] };

// Static class strings so Tailwind's JIT keeps them.
const HEALTH_ACCENTS: Record<HealthAccent, { badge: string; tile: string; value: string; bar: string }> = {
  amber: { badge: "bg-amber-100 text-amber-700", tile: "bg-amber-50/70", value: "text-amber-900", bar: "bg-amber-400" },
  sky: { badge: "bg-sky-100 text-sky-700", tile: "bg-sky-50/70", value: "text-sky-900", bar: "bg-sky-400" },
  rose: { badge: "bg-rose-100 text-rose-700", tile: "bg-rose-50/70", value: "text-rose-900", bar: "bg-rose-400" },
  indigo: { badge: "bg-indigo-100 text-indigo-700", tile: "bg-indigo-50/70", value: "text-indigo-900", bar: "bg-indigo-400" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", tile: "bg-emerald-50/70", value: "text-emerald-900", bar: "bg-emerald-400" }
};

// Daily goals: turns a bare number into "how am I doing". Sleep is in minutes.
const METRIC_TARGETS: Record<string, number> = {
  STEPS: 10000,
  ACTIVE_CALORIES: 500,
  EXERCISE: 30,
  WATER: 2,
  SLEEP: 480
};

const STATUS_TEXT: Record<"good" | "warn" | "bad", string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600"
};

// Colour semantics for metrics with a clinical normal range. Returns null for
// metrics where "good/bad" is context-dependent (e.g. live heart rate).
function metricStatus(type: string, value: number): "good" | "warn" | "bad" | null {
  switch (type) {
    case "RESTING_HEART_RATE":
      if (value < 45 || value > 85) return "bad";
      if (value > 70) return "warn";
      return "good";
    case "BLOOD_OXYGEN":
      if (value < 90) return "bad";
      if (value < 95) return "warn";
      return "good";
    case "BMI":
      if (value >= 30 || value < 17) return "bad";
      if (value >= 25 || value < 18.5) return "warn";
      return "good";
    case "BLOOD_PRESSURE_SYSTOLIC":
      if (value >= 140) return "bad";
      if (value >= 120) return "warn";
      return "good";
    case "BLOOD_PRESSURE_DIASTOLIC":
      if (value >= 90) return "bad";
      if (value >= 80) return "warn";
      return "good";
    default:
      return null;
  }
}

export const HEALTH_GROUPS: HealthGroup[] = [
  {
    id: "activity",
    title: "活動與能量",
    emoji: "🏃",
    accent: "amber",
    metrics: [
      { type: "STEPS", label: "步數", emoji: "👣", digits: 0 },
      { type: "DISTANCE", label: "距離", emoji: "📏", digits: 0 },
      { type: "SPEED", label: "速度", emoji: "⚡", digits: 1 },
      { type: "FLIGHTS_CLIMBED", label: "爬樓層", emoji: "🪜", digits: 0 },
      { type: "ACTIVITY_INTENSITY", label: "活動強度", emoji: "⏱️", digits: 0 },
      { type: "ACTIVE_CALORIES", label: "活動熱量", emoji: "🔥", digits: 0 },
      { type: "BASAL_CALORIES", label: "基礎消耗", emoji: "🌡️", digits: 0 },
      { type: "TOTAL_CALORIES", label: "每日總消耗", emoji: "⚡", digits: 0 },
      { type: "EXERCISE", label: "運動", emoji: "🏋️", digits: 0 }
    ]
  },
  {
    id: "body",
    title: "身體組成",
    emoji: "🧍",
    accent: "sky",
    metrics: [
      { type: "WEIGHT", label: "體重", emoji: "⚖️", digits: 1 },
      { type: "HEIGHT", label: "身高", emoji: "📐", digits: 0 },
      { type: "BMI", label: "BMI", emoji: "🧮", digits: 1 },
      { type: "BODY_FAT", label: "體脂率", emoji: "📊", digits: 1 },
      { type: "LEAN_BODY_MASS", label: "瘦體重", emoji: "💪", digits: 1 },
      { type: "BODY_WATER_MASS", label: "體水分", emoji: "💧", digits: 1 },
      { type: "BODY_TEMPERATURE", label: "體溫", emoji: "🌡️", digits: 1 },
      { type: "SKIN_TEMPERATURE", label: "皮膚溫度", emoji: "🌡️", digits: 1 }
    ]
  },
  {
    id: "vitals",
    title: "生命徵象",
    emoji: "❤️",
    accent: "rose",
    metrics: [
      { type: "HEART_RATE", label: "心率", emoji: "❤️", digits: 0 },
      { type: "RESTING_HEART_RATE", label: "靜息心率", emoji: "💗", digits: 0 },
      { type: "HRV", label: "HRV", emoji: "📈", digits: 0 },
      { type: "RESPIRATORY_RATE", label: "呼吸率", emoji: "🫁", digits: 0 },
      { type: "BLOOD_OXYGEN", label: "血氧", emoji: "🩸", digits: 0 },
      { type: "BLOOD_PRESSURE_SYSTOLIC", label: "收縮壓", emoji: "🩺", digits: 0 },
      { type: "BLOOD_PRESSURE_DIASTOLIC", label: "舒張壓", emoji: "🩺", digits: 0 },
      { type: "BLOOD_GLUCOSE", label: "血糖", emoji: "🍬", digits: 0 }
    ]
  },
  {
    id: "sleep",
    title: "睡眠",
    emoji: "🌙",
    accent: "indigo",
    metrics: [
      { type: "SLEEP", label: "睡眠", emoji: "😴", sleep: true },
      { type: "SLEEP_DEEP", label: "深睡", emoji: "🌑", sleep: true },
      { type: "SLEEP_LIGHT", label: "淺睡", emoji: "🌙", sleep: true },
      { type: "SLEEP_REM", label: "REM", emoji: "💤", sleep: true },
      { type: "SLEEP_AWAKE", label: "清醒", emoji: "☀️", sleep: true }
    ]
  },
  {
    id: "nutrition",
    title: "飲食與水分",
    emoji: "🍽️",
    accent: "emerald",
    metrics: [
      { type: "WATER", label: "喝水", emoji: "🥤", digits: 1 },
      { type: "NUTRITION", label: "營養攝取", emoji: "🍽️", digits: 0 }
    ]
  }
];

export function HealthGroupCard({
  group,
  metrics,
  chart,
  todayStart,
  todayEnd,
  tz
}: {
  group: HealthGroup;
  metrics: Record<string, MetricValue | undefined>;
  chart?: ReactNode;
  todayStart: Date;
  todayEnd: Date;
  tz: string;
}) {
  const accent = HEALTH_ACCENTS[group.accent];
  // Body composition (weight, body fat, ...) changes slowly and is meaningful
  // even when it's days old, so it shows the latest reading with its exact
  // timestamp. Every other group is a daily snapshot — only today's data counts.
  const showHistory = group.id === "body";
  // Only render tiles that actually have synced data — empty "尚未同步" tiles
  // dilute the real signal, so collapse them (and the whole card if nothing).
  const present = group.metrics.filter((m) => {
    const metric = metrics[m.type];
    if (!metric) return false;
    return showHistory || isWithin(metric.measuredAt, todayStart, todayEnd);
  });
  if (present.length === 0 && !chart) return null;
  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-lg ${accent.badge}`}>{group.emoji}</span>
        <h3 className="text-lg font-black">{group.title}</h3>
      </div>
      {chart ? <div className="mt-4">{chart}</div> : null}
      {present.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {present.map((m) => {
            const metric = metrics[m.type]!;
            const status = metricStatus(m.type, metric.value);
            const valueColor = status ? STATUS_TEXT[status] : accent.value;
            const target = METRIC_TARGETS[m.type];
            const pct = target ? Math.min(metric.value / target, 1) : null;
            return (
              <div className={`rounded-2xl p-3 ${accent.tile}`} key={m.type}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{m.emoji}</span>
                  <p className="text-xs text-stone-500">{m.label}</p>
                </div>
                <p className={`mt-1 text-lg font-black ${valueColor}`}>
                  {m.sleep ? formatSleep(metric) : formatHealthMetric(metric, m.digits ?? 0)}
                </p>
                {showHistory ? <p className="mt-0.5 text-[10px] text-stone-400">{formatMeasuredAt(metric.measuredAt, tz)}</p> : null}
                {pct !== null ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5">
                    <div className={`h-full rounded-full ${accent.bar}`} style={{ width: `${pct * 100}%` }} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// Apple-style activity rings: the day's hero metric for the health tab. Only
// today's readings count — this card is explicitly "今日活動".
export function ActivityHero({
  metrics,
  todayStart,
  todayEnd
}: {
  metrics: Record<string, MetricValue | undefined>;
  todayStart: Date;
  todayEnd: Date;
}) {
  const todayMetric = (type: string) => {
    const metric = metrics[type];
    return metric && isWithin(metric.measuredAt, todayStart, todayEnd) ? metric : undefined;
  };
  const rings = [
    { type: "STEPS", label: "步數", color: "#fbbf24" },
    { type: "ACTIVE_CALORIES", label: "活動熱量", color: "#fb7185" },
    { type: "EXERCISE", label: "運動", color: "#34d399" }
  ];
  if (!rings.some((r) => todayMetric(r.type))) return null;
  return (
    <div className="glass-dark iridescent rounded-[2rem] p-6 text-white">
      <p className="text-sm font-medium text-stone-400">今日活動</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {rings.map((r) => {
          const metric = todayMetric(r.type);
          const target = METRIC_TARGETS[r.type];
          const pct = metric ? metric.value / target : 0;
          return (
            <div className="flex flex-col items-center gap-2" key={r.type}>
              <ProgressRing percent={pct} color={r.color}>
                <span className="text-base font-black">{metric ? Math.round(metric.value).toLocaleString() : "—"}</span>
                <span className="text-[10px] text-stone-400">{metric ? `${Math.round(pct * 100)}%` : "未同步"}</span>
              </ProgressRing>
              <div className="text-center">
                <p className="text-xs font-medium text-stone-300">{r.label}</p>
                <p className="text-[10px] text-stone-500">目標 {target.toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressRing({ percent, color, children }: { percent: number; color: string; children: ReactNode }) {
  const radius = 32;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - Math.max(0, Math.min(percent, 1)));
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
        <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute flex flex-col items-center justify-center leading-none">{children}</div>
    </div>
  );
}

export type SleepSegment = { stage: string; start: string; end: string };

// Lanes are drawn top→bottom (awake at top, deep at bottom), matching how sleep
// hypnograms are conventionally read. Colours mirror SleepBar's stage palette.
const SLEEP_LANES: { stage: string; label: string; color: string }[] = [
  { stage: "AWAKE", label: "清醒", color: "#fcd34d" },
  { stage: "REM", label: "REM", color: "#c4b5fd" },
  { stage: "LIGHT", label: "淺睡", color: "#818cf8" },
  { stage: "DEEP", label: "深睡", color: "#4338ca" }
];

// Local hour/minute/second of an instant in a given IANA timezone, used to
// align grid ticks to wall-clock hour boundaries (handles whole-minute offsets
// like +05:30, not just whole hours).
function tzClockParts(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get("hour"), m: get("minute"), s: get("second") };
}

// Evenly-spaced wall-clock hour ticks across [start, end], aligned to clean
// hour boundaries (e.g. 23:00, 01:00, 03:00). Interval widens with the night's
// length so labels never crowd. Returns absolute timestamps within range.
function hourTicks(start: number, end: number, tz: string): number[] {
  const hours = (end - start) / 3_600_000;
  const stepH = hours <= 6 ? 1 : hours <= 11 ? 2 : 3;
  const stepMs = stepH * 3_600_000;
  const p = tzClockParts(start, tz);
  // Top of start's local hour, then back off so the hour is a multiple of stepH.
  let t = start - (p.m * 60_000 + p.s * 1_000) - (p.h % stepH) * 3_600_000;
  while (t < start) t += stepMs;
  const ticks: number[] = [];
  for (; t <= end; t += stepMs) ticks.push(t);
  return ticks;
}

// Hypnogram: a per-night timeline of which sleep stage occurred at what clock
// time. Each segment is a coloured block placed on its stage's lane, positioned
// horizontally by its start/end relative to the night's span. Vertical ticks
// mark wall-clock hours so any block can be read off to the minute.
export function SleepHypnogram({ segments, tz }: { segments: SleepSegment[]; tz: string }) {
  const laneOf = new Map(SLEEP_LANES.map((l, i) => [l.stage, i]));
  const segs = segments
    .map((s) => ({ stage: s.stage, from: Date.parse(s.start), to: Date.parse(s.end) }))
    .filter((s) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from && laneOf.has(s.stage))
    .sort((a, b) => a.from - b.from);
  if (segs.length < 2) return null;
  const start = segs[0].from;
  const end = Math.max(...segs.map((s) => s.to));
  const span = end - start;
  if (span <= 0) return null;
  const laneH = 18;
  const laneArea = SLEEP_LANES.length * laneH;
  const fmt = (t: number) => new Date(t).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const ticks = hourTicks(start, end, tz);
  const pct = (t: number) => `${((t - start) / span) * 100}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-stone-500">睡眠階段時間軸</p>
        <p className="text-[11px] font-medium text-stone-400">
          {fmt(start)}–{fmt(end)}
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="flex flex-col" style={{ width: 30 }}>
          {SLEEP_LANES.map((l) => (
            <span key={l.stage} className="flex items-center justify-end text-[10px] text-stone-400" style={{ height: laneH }}>
              {l.label}
            </span>
          ))}
        </div>
        <div className="flex-1">
          <div className="relative" style={{ height: laneArea }}>
            {/* Horizontal lane separators */}
            {SLEEP_LANES.map((l, i) => (
              <div key={l.stage} className="absolute inset-x-0 border-t border-black/5" style={{ top: i * laneH + laneH / 2 }} />
            ))}
            {/* Vertical wall-clock hour gridlines */}
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 border-l border-dashed border-black/10" style={{ left: pct(t), height: laneArea }} />
            ))}
            {segs.map((s, idx) => {
              const lane = laneOf.get(s.stage)!;
              return (
                <div
                  key={idx}
                  className="absolute rounded-sm"
                  style={{
                    left: pct(s.from),
                    width: `${Math.max(((s.to - s.from) / span) * 100, 0.5)}%`,
                    top: lane * laneH + 3,
                    height: laneH - 6,
                    background: SLEEP_LANES[lane].color
                  }}
                  title={`${SLEEP_LANES[lane].label} ${fmt(s.from)}–${fmt(s.to)}`}
                />
              );
            })}
          </div>
          {/* Hour tick labels aligned to the gridlines above */}
          <div className="relative mt-1 h-3 text-[10px] text-stone-400">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t) }}>
                {fmt(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stacked composition bar for sleep stages (values in minutes).
export function SleepBar({ deep, light, rem, awake }: { deep?: number; light?: number; rem?: number; awake?: number }) {
  const segments = [
    { label: "深睡", value: deep ?? 0, color: "#4338ca" },
    { label: "淺睡", value: light ?? 0, color: "#818cf8" },
    { label: "REM", value: rem ?? 0, color: "#c4b5fd" },
    { label: "清醒", value: awake ?? 0, color: "#fcd34d" }
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-black/5">
        {segments.map((s) => (s.value > 0 ? <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) =>
          s.value > 0 ? (
            <span className="flex items-center gap-1 text-[11px] text-stone-500" key={s.label}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label} {Math.floor(s.value / 60)}:{String(Math.round(s.value % 60)).padStart(2, "0")}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

// Lightweight inline trend line — no chart library, just an SVG polyline.
export function Sparkline({ points, label, unit }: { points: number[]; label: string; unit: string }) {
  if (points.length < 2) return null;
  const width = 260;
  const height = 56;
  const pad = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((value, index) => {
      const x = pad + (index / (points.length - 1)) * (width - 2 * pad);
      const y = pad + (1 - (value - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last - first;
  const deltaColor = delta > 0 ? "text-rose-500" : delta < 0 ? "text-emerald-600" : "text-stone-400";
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500">{label}</p>
        <p className={`text-xs font-bold ${deltaColor}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "＝"} {Math.abs(delta).toFixed(1)} {unit}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-14 w-full" preserveAspectRatio="none">
        <polyline points={coords} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-stone-400">
        <span>{first.toFixed(1)}</span>
        <span>最新 {last.toFixed(1)} {unit}</span>
      </div>
    </div>
  );
}

// Frosted stat tile shared by the metabolism estimate and version-info cards.
export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.6)", backdropFilter: "blur(8px)" }}>
      <p className="text-xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-stone-500">{label}</p>
    </div>
  );
}
