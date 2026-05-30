"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GoogleId = {
  initialize: (config: { client_id: string; callback: (res: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export function GoogleLinkPanel({
  clientId,
  linked
}: {
  clientId?: string;
  linked: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId || linked) return;

    async function onCredential(response: { credential: string }) {
      setError("");
      setBusy(true);
      const res = await fetch("/api/auth/google/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: response.credential })
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setError(data.error ?? "綁定失敗");
        return;
      }
      router.refresh();
    }

    function render() {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: clientId!, callback: onCredential });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: "zh_TW"
      });
    }

    if (window.google) {
      render();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", render);
      return () => existing.removeEventListener("load", render);
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, linked]);

  async function unbind() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/google/link", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "解除綁定失敗");
      return;
    }
    router.refresh();
  }

  if (!clientId) return null;

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-xl font-black">Google 帳號綁定</h2>
      {linked ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-green-700">✓ 已綁定 Google 帳號</p>
          <button
            onClick={unbind}
            disabled={busy}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
          >
            解除綁定
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-500">綁定後即可使用 Google 一鍵登入。</p>
          <div className="mt-3" ref={ref} />
        </>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
