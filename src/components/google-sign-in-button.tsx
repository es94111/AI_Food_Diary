"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/turnstile-widget";
import { TURNSTILE_LOGIN_ACTION } from "@/lib/turnstile-config";

// Minimal typing for the Google Identity Services global.
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

export function GoogleSignInButton({
  clientId,
  turnstileSiteKey,
}: {
  clientId?: string;
  turnstileSiteKey: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileTokenRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const configuredClientId = clientId;

    async function onCredential(response: { credential: string }) {
      if (busyRef.current) return;
      const turnstileToken = turnstileTokenRef.current;
      if (!turnstileToken) {
        setError("請先完成下方人機驗證。");
        return;
      }

      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: response.credential,
            "cf-turnstile-response": turnstileToken,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Google 登入失敗");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("Google 登入失敗，請稍後再試。");
      } finally {
        // Turnstile tokens are single-use. Reset on success, rejection,
        // provider failure, and network failure before allowing another try.
        turnstileTokenRef.current = null;
        setTurnstileReady(false);
        turnstileRef.current?.reset();
        busyRef.current = false;
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
        width: 320,
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
  }, [clientId]);

  if (!clientId) {
    return (
      <p className="mt-6 text-sm text-red-700">
        Google SSO 尚未設定，請聯絡管理員。
      </p>
    );
  }

  return (
    <div
      className="mt-6 flex flex-col items-center gap-2"
      aria-busy={busy}
      aria-disabled={!turnstileReady || busy}
    >
      <p className="text-xs text-stone-500">請先完成人機驗證，再選擇 Google 登入。</p>
      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_LOGIN_ACTION}
        onToken={(token) => {
          turnstileTokenRef.current = token;
          setTurnstileReady(Boolean(token));
          if (token && error === "請先完成下方人機驗證。") setError("");
        }}
      />
      <div
        className={
          busy || !turnstileReady ? "pointer-events-none opacity-60" : undefined
        }
        ref={ref}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
