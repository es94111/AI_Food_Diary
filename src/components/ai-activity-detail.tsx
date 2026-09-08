"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ActivityDetail = {
  event: {
    id: string;
    timestamp: string;
    user: { id: string; name: string | null; email: string };
    actorType: string;
    actorSource: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    mcpToolName: string | null;
    beforeState: unknown;
    afterState: unknown;
    requestId: string;
    correlationId: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    isRestored: boolean;
    restoredAt: string | null;
    restoredBy: string | null;
    restoreActionId: string | null;
    restoreReason: string | null;
    resourceVersion: string | null;
  };
  restorePreview: {
    eligible: boolean;
    conflict: boolean;
    conflictReason: string | null;
    currentState: unknown;
    afterRestoreState: unknown;
    expectedVersion: string | null;
  };
};

function bodyError(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[無法顯示]";
  }
}

export function AiActivityDetail({ eventId }: { eventId: string }) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-activity/${encodeURIComponent(eventId)}`, { cache: "no-store", credentials: "same-origin" });
      const body = (await response.json()) as ActivityDetail | unknown;
      if (!response.ok) throw new Error(bodyError(body, "無法載入 AI 操作詳情。"));
      setDetail(body as ActivityDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入 AI 操作詳情。");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore() {
    if (!detail?.restorePreview.eligible || !confirmed || !reason.trim()) return;
    setRestoring(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-activity/${encodeURIComponent(eventId)}/restore`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          reason: reason.trim(),
          ...(detail.restorePreview.expectedVersion ? { expectedVersion: detail.restorePreview.expectedVersion } : {}),
        }),
      });
      const body = await response.json() as unknown;
      if (!response.ok) throw new Error(bodyError(body, "還原未完成。"));
      setReason("");
      setConfirmed(false);
      await load();
    } catch (restoreError) {
      const restoreMessage = restoreError instanceof Error ? restoreError.message : "還原未完成。";
      await load();
      setError(restoreMessage);
    } finally {
      setRestoring(false);
    }
  }

  if (loading && !detail) return <p className="mt-8 text-stone-500" role="status">載入中…</p>;
  if (!detail) return <div className="mt-8"><p className="text-red-700" role="alert">{error || "找不到 AI 操作紀錄。"}</p><Link className="mt-4 inline-block underline" href="/dashboard/ai-activity">返回列表</Link></div>;

  const event = detail.event;
  const preview = detail.restorePreview;
  return (
    <div className="mt-6 space-y-5">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div> : null}
      <section className="glass rounded-[2rem] p-6">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Fact label="操作時間" value={new Date(event.timestamp).toLocaleString("zh-TW")} />
          <Fact label="AI 來源" value={`${event.actorType} / ${event.actorSource}`} />
          <Fact label="使用者" value={`${event.user.name || event.user.email} (${event.user.id})`} />
          <Fact label="MCP Tool" value={event.mcpToolName || "—"} mono />
          <Fact label="操作／結果" value={`${event.action} / ${event.status}`} />
          <Fact label="影響資料" value={`${event.resourceType} / ${event.resourceId || "—"}`} mono />
          <Fact label="Request ID" value={event.requestId} mono />
          <Fact label="Correlation ID" value={event.correlationId} mono />
          <Fact label="還原狀態" value={event.isRestored ? `已於 ${event.restoredAt ? new Date(event.restoredAt).toLocaleString("zh-TW") : "未知時間"}由 ${event.restoredBy || "未知使用者"}還原` : "未還原"} />
          {event.restoreReason ? <Fact label="還原原因" value={event.restoreReason} /> : null}
        </dl>
        {event.errorCode || event.errorMessage ? <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800"><strong>{event.errorCode || "ERROR"}</strong><p>{event.errorMessage}</p></div> : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <StatePanel title="操作前狀態" value={event.beforeState} />
        <StatePanel title="操作後狀態" value={event.afterState} />
      </div>

      <section className="glass rounded-[2rem] p-6">
        <h2 className="text-xl font-black">還原 AI 操作</h2>
        <p className="mt-1 text-sm text-stone-600">此操作不會修改或刪除原始 audit event；系統會新增人類 restore event，並只補償 AI 建立的資料。</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <StatePanel title="目前資料狀態" value={preview.currentState} nested />
          <StatePanel title="還原後結果" value={preview.afterRestoreState} nested />
        </div>
        {preview.conflict ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status"><strong>無法直接還原</strong><p>{preview.conflictReason}</p></div> : null}
        {preview.eligible ? (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">還原原因（會寫入不可變 audit event）
              <textarea className="mt-1 min-h-24 w-full rounded-2xl border border-stone-300 bg-white p-3 font-normal" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-stone-200 p-4 text-sm">
              <input className="mt-1" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>我已確認即將還原 Action <code>{event.id}</code>，影響 {event.resourceType} <code>{event.resourceId}</code>，並了解若版本已變更，伺服器會拒絕執行。</span>
            </label>
            <button className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={restoring || !confirmed || !reason.trim()} onClick={() => void restore()}>{restoring ? "確認版本並還原中…" : "還原這筆 AI 操作"}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt><dd className={`mt-1 break-words text-sm ${mono ? "font-mono" : "font-semibold"}`}>{value}</dd></div>;
}

function StatePanel({ title, value, nested = false }: { title: string; value: unknown; nested?: boolean }) {
  return <section className={nested ? "rounded-2xl border border-stone-200 bg-white/60 p-4" : "glass rounded-[2rem] p-6"}><h2 className="text-lg font-black">{title}</h2><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-stone-950 p-4 text-xs text-stone-100" aria-label={`${title} JSON（純文字）`}>{pretty(value)}</pre></section>;
}
