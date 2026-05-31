"use client";

import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode, turnstileSiteKey }: { mode: "login" | "register"; turnstileSiteKey?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setError("");
    setLoading(true);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData))
    });

    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "登入失敗");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form action={onSubmit} className="mt-8 space-y-4">
      {mode === "register" ? (
        <input className="w-full rounded-2xl border border-stone-200 px-4 py-3" name="name" placeholder="名稱" />
      ) : null}
      <input className="w-full rounded-2xl border border-stone-200 px-4 py-3" name="email" placeholder="Email" type="email" required />
      <input className="w-full rounded-2xl border border-stone-200 px-4 py-3" name="password" placeholder="密碼" type="password" minLength={8} required />
      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="w-full rounded-2xl bg-stone-950 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "處理中..." : mode === "login" ? "登入" : "註冊"}
      </button>
    </form>
  );
}
