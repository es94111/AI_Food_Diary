"use client";

import { useId, useState } from "react";
import { clearPwaCaches, clearPwaLocalStorage, setPwaLogoutInProgress } from "@/lib/pwa-storage";

export function LogoutButton({ className = "" }: { className?: string }) {
  const errorId = useId();
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setError("");
    setLoggingOut(true);
    setPwaLogoutInProgress(true);
    try {
      clearPwaLocalStorage(window.localStorage);
      if ("caches" in window) await clearPwaCaches(window.caches);
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout request failed");
      window.location.replace("/login");
    } catch {
      setPwaLogoutInProgress(false);
      setError("登出未完成；請確認網路及本機儲存權限後重試。");
      setLoggingOut(false);
    }
  }

  return (
    <span>
      <button
        aria-describedby={error ? errorId : undefined}
        className={className || "rounded-full bg-white px-5 py-3 font-semibold shadow-sm"}
        disabled={loggingOut}
        onClick={logout}
        type="button"
      >
        {loggingOut ? "登出中…" : "登出"}
      </button>
      {error ? <span className="logout-error-toast" id={errorId} role="alert">{error}</span> : null}
    </span>
  );
}
