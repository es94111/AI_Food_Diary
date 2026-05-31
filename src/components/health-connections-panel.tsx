"use client";

import { useState } from "react";

export function HealthConnectionsPanel() {
  const [deviceName, setDeviceName] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createConnection() {
    setLoading(true);
    setMessage("");
    setToken("");
    const response = await fetch("/api/health/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: deviceName.trim() || undefined })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error ?? "建立同步裝置失敗。");
      return;
    }

    setToken(data.token);
    setDeviceName("");
    setMessage("同步 token 已建立，請立即複製到 Flutter app。關閉後不會再次顯示。");
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setMessage("已複製 token。");
  }

  return (
    <div className="mt-5 rounded-2xl bg-white/55 p-4" style={{ border: "1px solid rgba(255,255,255,0.65)" }}>
      <h3 className="text-sm font-black text-stone-800">Flutter 同步裝置</h3>
      <p className="mt-1 text-xs text-stone-500">建立 Bearer token 後，Flutter app 可用 Health Connect 背景同步資料。</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" onChange={(event) => setDeviceName(event.target.value)} placeholder="裝置名稱，例如 Pixel 9" value={deviceName} />
        <button className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={createConnection} type="button">
          {loading ? "處理中..." : "建立 token"}
        </button>
      </div>

      {token ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">只顯示一次的同步 token</p>
          <code className="mt-2 block break-all rounded-lg bg-white p-2 text-xs text-stone-800">{token}</code>
          <button className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white" onClick={copyToken} type="button">複製 token</button>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-xs font-semibold text-amber-700">{message}</p> : null}
    </div>
  );
}
