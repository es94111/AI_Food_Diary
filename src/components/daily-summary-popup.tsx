"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// On the first visit of each local calendar day, show yesterday's summary.
// Normally the worker has already pre-computed it, so the peek is instant and
// no AI runs. If it hasn't (first day after enabling, worker missed its window,
// etc.) we generate it once on demand with a spinner so the user still sees it.
export function DailySummaryPopup() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [generating, setGenerating] = useState(false);
  const dismissedRef = useRef(false);

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
    const tzQuery = tz ? `&tz=${encodeURIComponent(tz)}` : "";
    const dateQuery = `date=${localDateStr(yesterday)}`;

    const fetchSummary = (generate: boolean) =>
      fetch(`/api/daily-summary?${dateQuery}${generate ? "&generate=1" : ""}${tzQuery}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => ((data?.summary as Summary | undefined) ?? null))
        .catch(() => null);

    (async () => {
      let result = await fetchSummary(false); // peek — no AI spend
      if (cancelled || dismissedRef.current) return;
      if (!result) {
        // Not pre-computed yet → generate once on demand (spends AI this once).
        setGenerating(true);
        result = await fetchSummary(true);
        if (cancelled || dismissedRef.current) return;
        setGenerating(false);
      }
      // Mark handled for today so we don't re-fetch/re-generate on every visit.
      try {
        localStorage.setItem(STORAGE_KEY, today);
      } catch {
        // ignore persistence failure
      }
      if (result) setSummary(result);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (typeof document === "undefined") return null;

  if (generating && !summary) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl bg-white px-6 py-8 shadow-2xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
          <p className="font-semibold text-stone-700">正在整理昨日總結…</p>
          <button
            className="mt-1 text-sm font-semibold text-stone-400"
            onClick={() => {
              dismissedRef.current = true;
              setGenerating(false);
            }}
            type="button"
          >
            略過
          </button>
        </div>
      </div>,
      document.body
    );
  }

  if (!summary) return null;

  return createPortal(
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
    </div>,
    document.body
  );
}
