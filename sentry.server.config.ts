// Sentry init for the Node.js server runtime (Server Components, Route
// Handlers, server actions). Loaded from src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: "https://b855c3e74c55b787ff0b6fc572fbc4e2@o4511575169040384.ingest.de.sentry.io/4511575644176464",
  integrations: [
    // Forward console.log / console.warn / console.error calls to Sentry as logs.
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    // Attach CPU profiles to traced spans (Node profiling).
    nodeProfilingIntegration(),
  ],
  // Send logs to Sentry.
  enableLogs: true,
  // Capture 100% of transactions for tracing. Lower this in production if the
  // event volume gets too high. Tracing must be enabled for profiling and for
  // GenAI/agent monitoring to work.
  tracesSampleRate: 1,
  // Agent (GenAI) monitoring: emit spans for LLM calls (the `openai` SDK is
  // auto-instrumented), including streaming responses. Gives latency, token
  // usage, model name and failures for the AI meal-analysis flows.
  streamGenAiSpans: true,
  dataCollection: {
    // Do NOT ship LLM inputs/outputs to Sentry — those contain the user's meal
    // photos, descriptions and AI replies (the very data we encrypt at rest).
    // Latency / tokens / model / errors are still captured without them. Flip
    // these to true only if you need to inspect actual prompts/responses.
    genAI: { inputs: false, outputs: false },
  },
  // Profiling sample rate, evaluated once per SDK.init. Lower in production if
  // the profiling overhead/volume gets too high.
  profileSessionSampleRate: 1.0,
  // Automatically profile during active traces.
  profileLifecycle: "trace",
  // Set to true temporarily to debug SDK setup issues.
  debug: false,
});
