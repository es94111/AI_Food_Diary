"use client";

import { useState } from "react";

// Shown instead of the Google Sign-In button when the login page is loaded
// inside an embedded in-app browser (e.g. ChatGPT's mobile app connecting the
// MCP connector), where Google blocks sign-in outright. Copy-link is the only
// 100%-reliable escape hatch since WebView hosts vary in whether they honor
// target="_blank".
export function OpenInSystemBrowser({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-stone-800">
      <p className="font-semibold text-amber-800">⚠️ Google 登入在此瀏覽器中無法使用</p>
      <p className="mt-2 text-stone-600">
        你目前是在 App 內建的瀏覽器中開啟這個頁面（例如 ChatGPT App），Google
        基於安全考量不允許在這類環境中登入。請在手機的 Safari 或 Chrome
        瀏覽器中開啟下方連結以完成登入。
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-12 flex items-center justify-center rounded-xl bg-amber-600 px-5 text-center font-bold text-white shadow-sm hover:bg-amber-700"
        >
          在瀏覽器中開啟
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="min-h-12 rounded-xl border border-stone-300 px-5 font-semibold text-stone-700"
        >
          {copied ? "已複製連結 ✓" : "複製連結"}
        </button>
        <code className="break-all rounded-lg bg-white/70 p-3 text-xs text-stone-500">
          {url}
        </code>
      </div>
    </div>
  );
}
