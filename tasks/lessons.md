# Lessons

## 2026-08-23 — mobile yesterday summary regression

- **Failure mode:** The v0.72 mobile UI refinement removed the dashboard call to the existing `showDailySummaryPopup` flow, so the app could fetch yesterday's data for the home widget but never display it.
- **Detection signal:** `rg "showDailySummaryPopup" mobile/lib` returned only the widget definition; the dashboard still contained yesterday-summary state used only for widget publishing.
- **Prevention rule:** When refactoring UI, verify each existing user-visible behavior has either a retained call site or a focused acceptance test, especially for time-based startup flows such as “first open after midnight.”

## 2026-08-23 — health sync validation boundary

- **Failure mode:** A server-side 32 KiB cap rejected the entire health batch when one optional Android sleep timeline exceeded the limit.
- **Detection signal:** `ZodError` at `metrics[57].raw`; `_appendSleep` was the only producer of the optional `raw` timeline.
- **Prevention rule:** For optional metadata limits, enforce the cap on the client and server, discard only the oversized metadata, and keep a regression check so core metric sync is not coupled to timeline size.
