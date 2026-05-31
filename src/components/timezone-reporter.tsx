"use client";

import { useEffect } from "react";

// Reports the browser's timezone so server-rendered pages and API routes bucket
// days in the user's zone. Sets a cookie (read by SSR on the next load) and, when
// the zone changed, persists it to the profile for cross-device / cookie-loss cases.
export function TimezoneReporter({ serverTimezone }: { serverTimezone?: string }) {
  useEffect(() => {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!tz) return;

    document.cookie = `afd_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;

    if (tz !== serverTimezone) {
      fetch("/api/me/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz })
      }).catch(() => {});
    }
  }, [serverTimezone]);

  return null;
}
