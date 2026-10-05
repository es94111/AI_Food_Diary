# Lessons

## 2026-10-05 — Major-version dependency bumps need their own PR (and a data-collection audit)

- **Failure mode:** Dependabot opened `@sentry/nextjs` and `@sentry/profiling-node` 10.75 → 11.0 as two separate PRs. Each failed CI on its own (`enableLogs` removed, `nodeProfilingIntegration()` type mismatch) because the two packages must move together, and the migration guide also flips `dataCollection` defaults to *collect everything* — which for this app would start shipping meal photos and AI replies to Sentry. The two green "minor-patch group" PRs were safe; the two red ones were not.
- **Detection signal:** `gh pr checks <n>` showed `Build=fail` while the other two PRs were `CLEAN`; `gh run view --job <id> --log-failed` named the removed options; `npm view @sentry/nextjs@11.0.0 engines` showed `>=22.12.0` (CI uses Node 22 — verify the minor, not just the major).
- **Prevention rule:** For a major bump, read the vendor migration guide before touching code, land it on one branch with every package that must move in lockstep, and explicitly re-pin any privacy/PII default that the major changed. After `npm install`, prove the resolved runtime config with a throwaway `tsx` script (`Sentry.getClient().getOptions()`) instead of trusting the source.

## 2026-10-04 — Do not create a partial `.env` when the file is absent

- **Failure mode:** A settings helper continued after an absent-file read error and created an incomplete `.env` containing only the new integration setting.
- **Detection signal:** The file contained exactly one variable and had a fresh timestamp; the project Docker Compose uses `.env` as the complete application environment.
- **Prevention rule:** Check that `.env` exists before editing it. For absent files, update the tracked `.env.example` and deployment configuration, and never synthesize a partial runtime `.env`.


## 2026-10-03 — Quote literal backticks in shell release notes

- **Failure mode:** A double-quoted `gh release create --notes` argument contained Markdown backticks; zsh treated the enclosed text as command substitution and omitted the literal reference from the release notes.
- **Detection signal:** The command printed `zsh:1: no such file or directory: next/og`, and reviewing the published release showed the reference was missing.
- **Prevention rule:** Pass Markdown notes with literal backticks through a single-quoted multiline argument or a temporary notes file, then inspect the published text with `gh release view` after the mutation.

## 2026-10-05 — Add query parameters without breaking legacy URLs

- **Failure mode:** Signed saved-food image URLs already contain `?k=...`, while legacy inline-image URLs have no query string. Appending `&w=256` unconditionally made legacy thumbnail URLs malformed (`/image&w=256`).
- **Detection signal:** Trace both branches of an optional URL field back to their constructors, then assert thumbnail URL output for both query-bearing signed URLs and bare legacy routes.
- **Prevention rule:** When composing URLs, use URL/search-param APIs (or a shared tested helper) rather than hard-coding `&`; cover both empty and existing query-string cases.

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
