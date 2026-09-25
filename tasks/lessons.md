# Lessons

## 2026-09-26 — Avoid formatting unrelated Dart lines

- **Failure mode:** Running `dart format` on whole legacy files while changing health sync produced hundreds of unrelated line-wrap edits.
- **Detection signal:** `git diff --stat` showed hundreds of changed lines in files where the behavior edit was only a few lines.
- **Prevention rule:** Compare diff size immediately after formatting; for files not already formatter-clean, restore the original layout and reapply only the functional hunks before verification.

## 2026-09-25 — IndexedStack visibility is not TickerMode

- **Failure mode:** I used `TickerMode` to decide whether an update card in an `IndexedStack` was still visible after an asynchronous permission check. `IndexedStack` keeps inactive children mounted and does not mute their tickers, so the update dialog could still open over another tab.
- **Detection signal:** A focused widget test switched the stack index before calling `runUpdate`; the test hung waiting for a dialog that should not have opened. Flutter's local `indexed_stack.dart` shows it wraps children in a visibility scope.
- **Prevention rule:** Check `Visibility.of(context)` for `IndexedStack` tab visibility and test asynchronous UI work against the actual parent navigation widget rather than inferring visibility from `mounted` or ticker state.

## 2026-08-23 — mobile yesterday summary regression

- **Failure mode:** The v0.72 mobile UI refinement removed the dashboard call to the existing `showDailySummaryPopup` flow, so the app could fetch yesterday's data for the home widget but never display it.
- **Detection signal:** `rg "showDailySummaryPopup" mobile/lib` returned only the widget definition; the dashboard still contained yesterday-summary state used only for widget publishing.
- **Prevention rule:** When refactoring UI, verify each existing user-visible behavior has either a retained call site or a focused acceptance test, especially for time-based startup flows such as “first open after midnight.”

## 2026-08-23 — health sync validation boundary

- **Failure mode:** A server-side 32 KiB cap rejected the entire health batch when one optional Android sleep timeline exceeded the limit.
- **Detection signal:** `ZodError` at `metrics[57].raw`; `_appendSleep` was the only producer of the optional `raw` timeline.
- **Prevention rule:** For optional metadata limits, enforce the cap on the client and server, discard only the oversized metadata, and keep a regression check so core metric sync is not coupled to timeline size.

## 2026-09-25 — minimatch override bumped into a v3-only consumer

- **Failure mode:** Bumping the `eslint-config-next` → `minimatch` override from `^10.0.3` to `^10.2.6` (plus collapsing it to a global `minimatch` override in one intermediate attempt) made npm hoist minimatch **10** into `eslint-plugin-import`, `eslint-plugin-react`, and `eslint-plugin-jsx-a11y`. Those plugins call `minimatch(...)` as a **function** (the v3 API); minimatch 10's CJS export is a namespaced object whose entry point is `dist/commonjs/index.js`, so every pattern-based rule call would throw `TypeError: mm is not a function`.
- **Detection signal:** `node -e 'require("minimatch")("a/b.txt","**/*.txt")'` throws `mm is not a function` while `mm.minimatch(...)` works; resolving minimatch from each plugin's directory showed `10.2.6 callable=false` against a baseline of `3.1.5 callable=true`. `grep -rn "minimatch(" eslint-plugin-*/lib` showed the bare-call sites.
- **Prevention rule:** Before bumping an `overrides` entry, check whether the override was even *in effect* at baseline (`npm ci` in a scratch tree, then resolve the package from each consumer's directory). An override that is inert because ordinary semver already resolves the desired shape is not a safety net — activating it is equivalent to force-downgrading/upgrading an unrelated dependency, so verify each consumer's call style (function vs `new Minimatch()`) and re-resolve from the consumer's own directory after any override change. Prefer no override when ranges already resolve correctly.
