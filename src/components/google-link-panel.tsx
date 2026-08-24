"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GoogleId = {
  initialize: (config: {
    client_id: string;
    callback: (res: { credential: string }) => void;
  }) => void;
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
  linked,
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
    const configuredClientId = clientId;

    async function onCredential(response: { credential: string }) {
      setError("");
      setBusy(true);
      try {
        const res = await fetch("/api/auth/google/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: response.credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "綁定失敗");
          return;
        }
        router.refresh();
      } catch {
        setError("Google 綁定失敗，請稍後再試。");
      } finally {
        setBusy(false);
      }
    }

    function render() {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: configuredClientId,
        callback: onCredential,
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: "zh_TW",
      });
    }

    if (window.google) {
      render();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
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

  if (!clientId) {
    return (
      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">登入方式</h2>
        <p className="mt-2 text-sm text-stone-500">
          本服務僅支援 Google SSO；Google 登入尚未設定，請聯絡管理員。
        </p>
      </div>
    );
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6" aria-busy={busy}>
      <h2 className="text-xl font-black">登入方式</h2>
      {linked ? (
        <p className="mt-3 text-sm font-medium text-green-700">
          ✓ Google SSO 已綁定。Google 是目前唯一可用的登入方式。
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-500">
            此既有帳號尚未綁定 Google；完成綁定後即可使用 Google SSO 登入。
          </p>
          <div className="mt-3" ref={ref} />
        </>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
