# Lessons

## 2026-10-07 — Preserve separators when editing adjacent object fields

- **Failure mode:** Updating an MCP tool's description accidentally removed the comma before the following `inputSchema` property, leaving TypeScript syntax invalid.
- **Detection signal:** The targeted test/build failed during parsing at the next object property (`Expected "}" but found "inputSchema"`); `tsc --noEmit` reported the same location.
- **Prevention rule:** When replacing a string-valued object property, include and preserve its trailing comma in the replacement. Run the smallest parser-backed test immediately after changing tool registration metadata.

## 2026-10-07 — Run Flutter commands from the package root

- **Failure mode:** Running `flutter test` from the repository root failed with “No pubspec.yaml file found” because the Flutter package is in `mobile/`.
- **Detection signal:** Flutter exits before resolving packages and says no `pubspec.yaml` exists in the current directory.
- **Prevention rule:** Run Flutter commands from the app package root (`cd mobile && flutter ...`) and keep web commands at the repository root.

## 2026-10-07 — High-risk deletion flows need CI and client-state gates

- **Failure mode:** A server-side account erasure flow can appear complete while an append-only trigger still permits identity reassignment, local Android/PWA drafts survive, or destructive integration tests never run in CI.
- **Detection signal:** Review trigger predicates for all mutable identity columns, test connection-string override parameters (not only URL host/path), and verify the integration suite is wired to an isolated `*_test` PostgreSQL service. Check every client-side persistence surface before declaring erasure complete.
- **Prevention rule:** For deletion features, include database-trigger adversarial tests, a strict reusable test-database URL guard, CI execution, and explicit cleanup of app-owned local storage/cache helpers. When related PRs provide those helpers or export routes, coordinate merge order and re-run the dependent PR checks.

## 2026-10-06 — New AI feature: decrypt at the response boundary, and never spread a sibling mapper

- **Failure mode:** Two defects in the same change. (1) The on-demand `generate=1` route returned the raw Prisma row from `generateAndStoreWeeklySummary`. Because the write helper moves AI text into `enc*` columns and leaves the plaintext columns `null`, clients received literal nulls — the web card rendered `null\n\nnull` and the app card looked correct only after a reload (which took the decrypted peek path). (2) `toExportWeeklySummary` spread `toExportDailySummary`, injecting a `summaryDate: ""` field the weekly table has no column for into every exported row.
- **Detection signal:** Compare the new route against its sibling line by line: `/api/daily-summary` ends with `decryptDailySummary(summary)` while `/api/weekly-summary` ended with the bare `summary`. For the export, `assert.ok(!("summaryDate" in row))` on the emitted artifact; a spread of a sibling mapper is the tell.
- **Prevention rule:** When a feature mirrors an existing one, diff the two implementations side by side and copy every boundary step (here: encrypt-on-write ⇒ decrypt-on-response, and never return the Prisma row directly). Prefer building an export row field-by-field over spreading a different model's mapper, and assert the artifact's exact shape. Add a behavioral route test — Node's `mock.module` can mock only `requireUser` and the AI call, leaving encryption, the DB write and the response body as real code — so the client-visible payload is asserted, not just the stored row.

## 2026-10-06 — Adding a new table silently drops it from admin export/import

- **Failure mode:** Adding the `WeeklySummary` table only to `prisma/schema.prisma` would have left it out of `src/lib/admin-export.ts` (`TABLE_KEYS`, the export schema, `buildExportEnvelope`, and the `writers` map). A backup-then-restore would then silently lose every user's weekly recaps — no error, no drift warning, just missing rows after a restore.
- **Detection signal:** `rg "dailySummaries|TABLE_KEYS" src` after adding a model shows the enumerated table lists; if the new model's name appears only in `prisma/` and in the generated client, the export/import path does not know about it.
- **Prevention rule:** When adding a Prisma model that stores user-generated content, grep for an existing sibling table (`dailySummaries`, `mealBundles`) and extend every enumerated list in `src/lib/admin-export.ts` — schema, envelope, `TABLE_KEYS` (this also drives `IMPORT_ORDER`), `buildExportEnvelope`'s query tuple and `data` map, plus the `writers` entry and its export-shape test — in the same PR.


## 2026-10-06 — Do not apply Dart formatting after a check flags baseline churn

- **Failure mode:** Running `dart format` across three modified legacy files introduced hundreds of unrelated line-wrap changes.
- **Detection signal:** `git diff --stat` jumped from the intended small edits to 366 insertions/deletions; restoring the files to `HEAD` and reapplying only behavior changes removed the noise.
- **Prevention rule:** If Dart format reports changes across existing files, do not write its output. Check baseline formatting first and keep only manually formatted changed hunks; inspect `git diff --stat` immediately after any formatter.

## 2026-10-06 — Use calendar arithmetic for weekly navigation

- **Failure mode:** Shifting a local date by `Duration(days: 7)` can land on the adjacent calendar day across daylight-saving changes, causing the selected weekly range to skip an extra week.
- **Detection signal:** Check whether date-only navigation uses elapsed durations; test both directions around DST boundaries and verify the resulting `yyyy-MM-dd` values.
- **Prevention rule:** Use calendar constructors for date-only week/month navigation; reserve `Duration` arithmetic for elapsed time.

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
