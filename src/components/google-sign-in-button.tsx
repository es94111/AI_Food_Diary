"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Minimal typing for the Google Identity Services global.
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

export function GoogleSignInButton({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId) return;

    async function onCredential(response: { credential: string }) {
      setError("");
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: response.credential })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Google 登入失敗");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    }

    function render() {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: clientId!, callback: onCredential });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        width: 320,
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
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div ref={ref} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
