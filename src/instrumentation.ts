import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per server runtime on startup. Load the matching
// Sentry init for the current runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail-loud config checks: these settings silently degrade security when
    // missing, so warn operators at startup instead of staying quiet.
    if (process.env.NODE_ENV === "production") {
      if (!process.env.TURNSTILE_SECRET_KEY) {
        console.warn(
          "[security] TURNSTILE_SECRET_KEY is not set — human verification (Turnstile) is DISABLED for login/register."
        );
      }
      if (!process.env.APP_PUBLIC_URL) {
        console.warn(
          "[security] APP_PUBLIC_URL is not set — the app-update endpoint derives apkUrl from Host headers."
        );
      }
    }
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures errors thrown in nested React Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
