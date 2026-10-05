// Sentry init for the Edge runtime (middleware, edge routes). Loaded from
// src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryDataCollection } from "@/lib/sentry-privacy";

Sentry.init({
  dsn: "https://b855c3e74c55b787ff0b6fc572fbc4e2@o4511575169040384.ingest.de.sentry.io/4511575644176464",
  integrations: [
    // Forward console.log / console.warn / console.error calls to Sentry as logs.
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  // Keep user content (meal photos, AI replies, DB payloads) out of Sentry.
  dataCollection: sentryDataCollection,
  tracesSampleRate: 1,
  debug: false,
});
