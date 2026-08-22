# Lessons

## 2026-08-23 — mobile yesterday summary regression

- **Failure mode:** The v0.72 mobile UI refinement removed the dashboard call to the existing `showDailySummaryPopup` flow, so the app could fetch yesterday's data for the home widget but never display it.
- **Detection signal:** `rg "showDailySummaryPopup" mobile/lib` returned only the widget definition; the dashboard still contained yesterday-summary state used only for widget publishing.
- **Prevention rule:** When refactoring UI, verify each existing user-visible behavior has either a retained call site or a focused acceptance test, especially for time-based startup flows such as “first open after midnight.”
