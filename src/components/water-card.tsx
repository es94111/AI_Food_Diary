"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WaterLog = { id: string; amountMl: number; drankAt: string };

const PRESETS = [100, 500, 800];

export function WaterCard({
  dateStr,
  tz,
  goalMl,
  initialLogs,
  initialTotalMl,
  isToday
}: {
  dateStr: string;
  tz: string;
  goalMl: number;
  initialLogs: WaterLog[];
  initialTotalMl: number;
  isToday: boolean;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState<WaterLog[]>(initialLogs);
  const [totalMl, setTotalMl] = useState(initialTotalMl);
  const [goal, setGoal] = useState(goalMl);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(goalMl));

  const percent = goal > 0 ? Math.min(Math.round((totalMl / goal) * 100), 100) : 0;

  async function refresh() {
    const res = await fetch(`/api/water?date=${dateStr}&tz=${encodeURIComponent(tz)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { logs: WaterLog[]; totalMl: number };
    setLogs(data.logs);
    setTotalMl(data.totalMl);
  }

  async function addWater(amountMl: number) {
    if (busy || !Number.isFinite(amountMl) || amountMl <= 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl })
      });
      if (res.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addCustom() {
    const value = Number(custom);
    if (!Number.isFinite(value) || value <= 0) return;
    await addWater(Math.round(value));
    setCustom("");
  }

  async function removeLog(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/water/${id}`, { method: "DELETE" });
      if (res.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal() {
    const value = Math.round(Number(goalDraft));
    if (!Number.isFinite(value) || value < 100 || value > 10000) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waterGoalMl: value })
      });
      if (res.ok) {
        setGoal(value);
        setEditingGoal(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black">喝水</h2>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-4xl font-black tracking-tight text-sky-600">{totalMl}</p>
            <p className="mb-1 text-sm font-semibold text-stone-400">/ {goal} ml</p>
          </div>
        </div>
        {editingGoal ? (
          <div className="flex items-center gap-1.5">
            <input
              className="w-20 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              type="number"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              aria-label="每日喝水目標 ml"
            />
            <button
              className="cursor-pointer rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
              type="button"
              onClick={saveGoal}
              disabled={busy}
            >
              儲存
            </button>
          </div>
        ) : (
          <button
            className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold text-stone-500 transition-colors hover:bg-stone-100"
            type="button"
            onClick={() => {
              setGoalDraft(String(goal));
              setEditingGoal(true);
            }}
          >
            目標 · {percent}%
          </button>
        )}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {PRESETS.map((amount) => (
          <button
            key={amount}
            className="cursor-pointer rounded-2xl bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
            type="button"
            onClick={() => addWater(amount)}
            disabled={busy}
          >
            +{amount} ml
          </button>
        ))}
        <div className="flex flex-1 items-center gap-2">
          <input
            className="w-full min-w-24 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            type="number"
            inputMode="numeric"
            placeholder="自訂 ml"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button
            className="cursor-pointer rounded-2xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
            type="button"
            onClick={addCustom}
            disabled={busy || !custom}
          >
            新增
          </button>
        </div>
      </div>

      <div className="mt-4">
        {logs.length === 0 ? (
          <p className="text-sm text-stone-400">{isToday ? "今天還沒記錄喝水。" : "這天沒有喝水紀錄。"}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-2.5">
                <span className="text-sm font-semibold text-stone-700">{log.amountMl} ml</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-400">
                    {new Date(log.drankAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button
                    className="cursor-pointer text-stone-300 transition-colors hover:text-rose-500 disabled:opacity-50"
                    type="button"
                    onClick={() => removeLog(log.id)}
                    disabled={busy}
                    aria-label="刪除喝水紀錄"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
