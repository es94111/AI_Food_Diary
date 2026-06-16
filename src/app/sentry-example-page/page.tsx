"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

// Temporary page for verifying the Sentry integration. Clicking the button
// raises both a client-side error and a server-side error (via the API route),
// each wrapped in a Sentry span. Confirm both land in Sentry Issues, then delete
// this page and src/app/api/sentry-example-api/route.ts.
class SentryExampleFrontendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleFrontendError";
  }
}

export default function SentryExamplePage() {
  const [hasSentError, setHasSentError] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  // Warn if Sentry's ingest endpoint is unreachable (ad blocker, network).
  useEffect(() => {
    Sentry.diagnoseSdkConnectivity().then((result) => {
      setIsConnected(result !== "sentry-unreachable");
    });
  }, []);

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1>Sentry 驗證頁</h1>
      <p style={{ maxWidth: 480, color: "#555" }}>
        點下面的按鈕會同時丟出前端與後端錯誤，到 Sentry Issues 確認有沒有收到。
        確認後請刪除這個頁面與對應的 API route。
      </p>

      <button
        type="button"
        style={{
          padding: "12px 20px",
          fontSize: 16,
          borderRadius: 8,
          border: "none",
          background: "#6c47ff",
          color: "#fff",
          cursor: "pointer",
        }}
        disabled={!isConnected}
        onClick={async () => {
          await Sentry.startSpan(
            { name: "Example Frontend/Backend Span", op: "test" },
            async () => {
              const res = await fetch("/api/sentry-example-api");
              if (!res.ok) {
                setHasSentError(true);
              }
              throw new SentryExampleFrontendError(
                "This error is raised on the frontend of the example page."
              );
            }
          );
        }}
      >
        Throw Sample Error
      </button>

      {hasSentError ? (
        <p style={{ color: "#2e7d32" }}>
          錯誤已送出，到 Sentry Issues 確認。
        </p>
      ) : !isConnected ? (
        <p style={{ color: "#c62828" }}>
          連不到 Sentry — 可能被廣告攔截器或網路擋住，請暫時關閉再試。
        </p>
      ) : null}
    </main>
  );
}
