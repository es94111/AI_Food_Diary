// Sentry init for the browser. Next.js loads this on the client automatically.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b855c3e74c55b787ff0b6fc572fbc4e2@o4511575169040384.ingest.de.sentry.io/4511575644176464",
  // Capture 100% of transactions for tracing. Lower this in production if the
  // event volume gets too high.
  tracesSampleRate: 1,
  // Set to true temporarily to debug SDK setup issues.
  debug: false,
});

// Required so Sentry can instrument client-side navigations (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
