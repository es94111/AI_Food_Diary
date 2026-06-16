"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// App Router global error boundary. Reports the render error to Sentry, then
// shows a minimal fallback. Must render its own <html>/<body>.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2>發生未預期的錯誤</h2>
          <p>請重新整理頁面再試一次。</p>
        </div>
      </body>
    </html>
  );
}
