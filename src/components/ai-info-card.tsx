"use client";

import { useState } from "react";
import { MarkdownContent } from "@/components/markdown-content";

export function AiInfoCard({ title, endpoint, type }: { title: string; endpoint: string; type: "advice" | "summary" }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    setLoading(true);
    const response = await fetch(endpoint);
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "產生失敗");
      return;
    }

    if (type === "advice") {
      setContent(data.advice);
    } else {
      setContent(`${data.summary.aiSummary}\n\n${data.summary.aiRecommendation}`);
    }
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-2xl font-black">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">點擊下方按鈕由 AI 產生內容，會消耗模型額度。</p>
      <button className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={load}>
        {loading ? "產生中..." : `產生${title}`}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {content ? <MarkdownContent className="mt-4 text-slate-700" content={content} /> : null}
    </div>
  );
}
