// Sentry init for the browser. Next.js loads this on the client automatically.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b855c3e74c55b787ff0b6fc572fbc4e2@o4511575169040384.ingest.de.sentry.io/4511575644176464",
  integrations: [
    // Forward console.log / console.warn / console.error calls to Sentry as logs.
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    // Attach JS self-profiles to traced spans (browser profiling). The Next.js
    // SDK already adds browserTracingIntegration by default, which profiling needs.
    Sentry.browserProfilingIntegration(),
    // Record Session Replays. Browser-only — never add this to server/edge config.
    Sentry.replayIntegration({
      // Privacy defaults are already on; we set them explicitly so intent is
      // clear and a future edit can't silently expose user data.
      maskAllText: true, // redact all rendered text
      maskAllInputs: true, // redact all <input>/<textarea>/<select> values
      blockAllMedia: true, // don't record images/video (food photos, avatars)
      // Belt-and-suspenders: even if maskAllText/maskAllInputs is later relaxed,
      // these auth fields stay masked. Selectors map to real fields in the app.
      mask: ['input[name="password"]', 'input[name="email"]', 'input[type="password"]'],
      // Block whole regions outright (replaced by a same-size placeholder).
      block: ['.sentry-block', '[data-sentry-block]'],
      // Drop input events entirely for elements you annotate.
      ignore: ['.sentry-ignore', '[data-sentry-ignore]'],
      // Note: to reveal a known-safe element, add the `sentry-unmask` /
      // `sentry-unblock` class (or matching data-* attribute) to it.
    }),
  ],
  // Send logs to Sentry.
  enableLogs: true,
  // Capture 100% of transactions for tracing. Lower this in production if the
  // event volume gets too high. Tracing must be enabled for profiling to work.
  tracesSampleRate: 1,
  // Profiling sample rate, decided once per session at SDK init.
  profileSessionSampleRate: 1.0,
  // Session Replay: record 10% of all sessions...
  replaysSessionSampleRate: 0.1,
  // ...but 100% of sessions where an error occurs.
  replaysOnErrorSampleRate: 1.0,
  // Set to true temporarily to debug SDK setup issues.
  debug: false,
});

// Required so Sentry can instrument client-side navigations (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
