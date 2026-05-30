"use client";

import { useCallback, useEffect, useState } from "react";
import { MarkdownContent } from "@/components/markdown-content";

function withParam(endpoint: string, param: string) {
  return endpoint + (endpoint.includes("?") ? "&" : "?") + param;
}

export function AiInfoCard({
  title,
  endpoint,
  type,
  canGenerate = true,
  blockedMessage
}: {
  title: string;
  endpoint: string;
  type: "advice" | "summary";
  canGenerate?: boolean;
  blockedMessage?: string;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function apply(data: { advice?: string; summary?: { aiSummary: string; aiRecommendation: string } | null }) {
    if (type === "advice") {
      setContent(data.advice ?? "");
    } else if (data.summary) {
      setContent(`${data.summary.aiSummary}\n\n${data.summary.aiRecommendation}`);
    }
  }

  // Auto-display an already-stored summary/advice on mount (peek, no AI spend).
  const peek = useCallback(async () => {
    try {
      const response = await fetch(type === "summary" ? endpoint : withParam(endpoint, "peek=1"));
      if (response.ok) apply(await response.json());
    } catch {
      // ignore — the user can still generate manually
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, type]);

  useEffect(() => {
    peek();
  }, [peek]);

  async function load() {
    if (!canGenerate) return;
    setError("");
    setLoading(true);
    const response = await fetch(type === "summary" ? withParam(endpoint, "generate=1") : endpoint);
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "產生失敗");
      return;
    }
    apply(data);
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-2xl font-black">{title}</h2>
      {content ? (
        <MarkdownContent className="mt-4 text-stone-700" content={content} />
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-stone-600">點擊下方按鈕由 AI 產生內容，會消耗模型額度。</p>
          <button className="mt-4 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={loading || !canGenerate} onClick={load}>
            {loading ? "產生中..." : `產生${title}`}
          </button>
          {!canGenerate && blockedMessage ? <p className="mt-3 text-sm text-stone-500">{blockedMessage}</p> : null}
        </>
      )}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
