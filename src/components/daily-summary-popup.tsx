"use client";

import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/markdown-content";

type Summary = {
  aiSummary: string;
  aiRecommendation: string;
  totalCalories: number | string;
};

const STORAGE_KEY = "daily-summary-popup-date";

function localDateStr(d: Date) {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// On the first visit of each local calendar day, fetch yesterday's pre-computed
// summary (peek — no `generate`, so it never triggers AI) and show it once.
export function DailySummaryPopup() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const today = localDateStr(new Date());
    try {
      if (localStorage.getItem(STORAGE_KEY) === today) return;
    } catch {
      return; // localStorage unavailable — skip silently
    }

    let cancelled = false;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const url = `/api/daily-summary?date=${localDateStr(yesterday)}${tz ? `&tz=${encodeURIComponent(tz)}` : ""}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.summary) return;
        setSummary(data.summary as Summary);
        try {
          localStorage.setItem(STORAGE_KEY, today);
        } catch {
          // ignore persistence failure
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-6 py-4">
          <div>
            <h2 className="text-2xl font-black">昨日總結</h2>
            <p className="mt-1 text-sm text-stone-500">攝取 {Math.round(Number(summary.totalCalories))} kcal</p>
          </div>
          <button className="shrink-0 rounded-full bg-stone-100 px-3 py-1 font-semibold" onClick={() => setSummary(null)} type="button">關閉</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <MarkdownContent className="text-stone-800" content={summary.aiSummary} />
          {summary.aiRecommendation?.trim() ? (
            <div className="mt-4 rounded-2xl bg-amber-50 p-4">
              <p className="font-black text-amber-800">建議</p>
              <MarkdownContent className="mt-1 text-amber-900" content={summary.aiRecommendation} />
            </div>
          ) : null}
        </div>
        <div className="border-t border-stone-200 p-4">
          <button className="w-full rounded-2xl bg-amber-700 px-4 py-3 font-semibold text-white" onClick={() => setSummary(null)} type="button">知道了</button>
        </div>
      </div>
    </div>
  );
}
