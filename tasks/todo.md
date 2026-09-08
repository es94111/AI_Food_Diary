# Railway cost / API request / memory optimization

## Goal + Acceptance Criteria

- [x] Find the root cause of repeated `/api/meals` and `/api/water` requests observed in Railway HTTP logs (0.1–1s apart bursts).
- [x] Implement GET single-flight/request coalescing in the Flutter `ApiClient`, separate from the existing on-disk response cache.
- [ ] Verify rebuild/lifecycle/background paths don't cause extra request storms (mostly confirmed clean by code review; see Root Causes).
- [ ] Evaluate Prisma singleton, Next.js standalone Docker output, image proxy streaming, Sentry overhead, `APP_PUBLIC_URL`.
- [ ] Full verification: `flutter analyze`, `flutter test`, `npm run build`, `npx prisma generate`, Docker build/run smoke test.
- [ ] Document before/after evidence; mark anything not measurable as `Not measured` / `NOT RUN`.

## Baseline (given)

- Railway `ai-food-diary` Web Service: RAM avg ≈230MB, peak ≈452MB; CPU avg ≈0.00014 vCPU, peak ≈0.048 vCPU; startup ≈416ms; Serverless sleep enabled, 1 replica.
- Railway HTTP logs show bursts of `GET /api/meals` / `GET /api/water` 0.1–1s apart.
- No Railway MCP/CLI project access available in this workspace — Railway-side before/after metrics are `Not measured`; instructions for the user to measure post-deploy are provided in the final report.

## Root Causes (confirmed by code reading, not guesswork)

### RC1 — Health sync fetches the same days' meals/water twice per sync (P0, primary suspect for the burst pattern)

- **File**: `mobile/lib/services/health_service.dart` (`writeRecentMealsToHealth`, `writeRecentWaterToHealth`, `_mealNutritionMetrics`, `_waterIntakeMetrics`, `syncNow`), `mobile/lib/widgets/health_sync_card.dart` (`_HealthSyncCardState._sync`).
- Every tap of "健康同步" (`_sync()`, always called with `mirrorMeals: true`, default `_syncDays = 7`) did:
  1. `writeRecentMealsToHealth(days)` → loop `for i in 0..<days`, one `MealService.mealsForDay()` (`GET /api/meals`) per day, to mirror into Health Connect.
  2. `writeRecentWaterToHealth(days)` → same loop pattern with `WaterService.forDay()` (`GET /api/water`) per day.
  3. `syncNow(days)` → internally calls `_mealNutritionMetrics(days)` and `_waterIntakeMetrics(days)`, which **independently repeat the exact same per-day loops** to build the cloud-upload payload.
- Net effect: one sync tap = 2× `GET /api/meals` + 2× `GET /api/water` per day in range — e.g. 14+14 requests for the default 7-day range, fired back-to-back in a sequential `await` loop (well within the observed 0.1–1s spacing).
- `HealthService.syncNow(days: 2)` is also called once per foreground entry (30s after `_bootstrap`, via `_syncHealthAfterEntry` in `dashboard_screen.dart`) — that path only self-fetches once (no `writeRecentMealsToHealth`/`writeRecentWaterToHealth` there), so it wasn't double-fetching, just a normal 2+2 request cost per app open.

### RC2 — No request coalescing existed for concurrent identical GETs (P1, defensive/required infra)

- **File**: `mobile/lib/services/api_client.dart`. `ApiClient.get()` had an on-disk response cache (write-through + offline fallback) but no in-flight de-duplication: N concurrent callers asking for the same `path+query` each fired their own HTTP request. No live call site was found that concurrently double-calls the exact same GET today (guards like `_loadGeneration`/`_mealLoadGeneration`/`_busy` already prevent most of that in `dashboard_screen.dart` and `water_card.dart`), but this is exactly the infrastructure the task requires and protects future call sites (and covers Scenario G / Test 1-4 explicitly required below).

### Reviewed and found clean (no code change needed)

- `dashboard_screen.dart`: `didChangeAppLifecycleState` only triggers `_maybeShowYesterdaySummary()` on resume, guarded by `_summaryCheckRunning` + a once-per-local-day `SharedPreferences` flag. No meals/water refetch on resume.
- `WaterCard` (`water_card.dart`): stable `ValueKey('water-$date')` so parent rebuilds reuse `State` (no `initState` re-fire); `didUpdateWidget` only reloads when `date` actually changes; `_busy` flag blocks double add/delete taps.
- `MealAnalysisController` (`meal_analysis_controller.dart`): `Timer.periodic(2s)` only polls a **local file** written by the WorkManager isolate (`BackgroundAnalysis.pollResult`), not the backend; stops on completion/cancel.
- `BackgroundAnalysis` (`background_analysis.dart`): uses `Workmanager().registerOneOffTask` (one-shot, user-triggered), never `registerPeriodicTask` — no periodic background HTTP.
- `UpdateService.check()`: only called from foreground entry (`_refreshAfterEntry`, once) and the update-card UI; no periodic timer.
- Home-screen widgets (`HomeWidgetUpdater.kt` + 5 `AppWidgetProvider`s): `onUpdate` (fired every `updatePeriodMillis=1800000` = 30 min by Android) only re-renders from a local `SharedPreferences` snapshot — **zero network calls**. `WaterQuickAddReceiver.kt` does 1 POST + 1 GET, but only on an explicit user tap of the widget's quick-add button.
- No `addListener`/`ChangeNotifier` subscription found without a matching `dispose()`-time removal.
- No `FutureBuilder` (or other rebuild-refetch anti-pattern) found anywhere in `mobile/lib`.

## Planned Changes

1. `mobile/lib/services/health_service.dart` — add `fetchRecentMeals(days)` / `fetchRecentWaterLogs(days)` shared fetch helpers; `writeRecentMealsToHealth`, `writeRecentWaterToHealth`, `syncNow` accept optional pre-fetched lists and skip their own fetch when provided.
2. `mobile/lib/widgets/health_sync_card.dart` — `_sync()` fetches meals/water once (when mirroring) and passes the same lists to all three calls.
3. `mobile/lib/services/api_client.dart` — add GET single-flight coalescing (`_inFlightGets` map keyed by normalized `path?query`), separate from `CacheService`; skip coalescing when per-call `headers` are supplied; clear the map in `clearSession()`; add `@visibleForTesting` hooks (`debugSetDioForTesting`, `debugResetForTesting`) so tests can inject a fake Dio adapter without needing secure-storage platform channels.
4. `mobile/test/api_client_coalescing_test.dart` (new) — coalescing/cache/failure/logout regression tests (Tests 1–7 from the task spec, adapted to this codebase's existing test style: no mocking library, hand-rolled fake `HttpClientAdapter` + a minimal in-memory fake for the `flutter_secure_storage` method channel).

## Risk & Rollback

- **Risk level**: low-medium. `health_service.dart` changes are additive (optional params, default `null` preserves old self-fetch behavior for every existing caller that doesn't pass the new params — e.g. `_syncHealthAfterEntry`'s `syncNow(days: 2)` is untouched). `api_client.dart` changes only affect GET; POST/PATCH/DELETE untouched.
- **Affected components**: Health Connect sync UI/flow, all GET traffic through `ApiClient`.
- **Rollback**: revert the 3 touched files; no schema/migration/dependency changes.
- **Concurrency risk**: coalescing key excludes calls with custom `headers` (none currently exist) to avoid merging different request contexts; `clearSession()` clears in-flight map to prevent cross-account leakage.

## Tests (planned)

- `cd mobile && flutter pub get`
- `cd mobile && flutter analyze`
- `cd mobile && flutter test`
- Targeted: `flutter test test/api_client_coalescing_test.dart`

## Verification (Web/Docker, if changed)

- `npm ci` (skip if already installed) / `npx prisma generate` / `npm run build`
- `docker build` only if Dockerfile/next.config.ts change (standalone evaluation) — see report for outcome.

## Results

- **RC1 confirmed against real Railway logs** (not just code reading): pulled 7-day HTTP proxy logs via Railway MCP for the `ai-food-diary` service and found repeated bursts of exactly 14 `GET /api/meals` + 14 `GET /api/water` within a few seconds (e.g. `2026-09-07T14:54:26`–`14:54:32`, two back-to-back 14+14 cycles). 14 = 2× the default `_syncDays = 7` in `health_sync_card.dart` — exact match for the "fetch each day twice" bug. Fixed by sharing one fetch per sync (`HealthService.fetchRecentMeals`/`fetchRecentWaterLogs`), verified by new tests in `mobile/test/health_service_recent_fetch_test.dart`.
- Implemented GET single-flight coalescing in `ApiClient` (`mobile/lib/services/api_client.dart`), separate from the on-disk cache; cleared on `clearSession()` to prevent cross-account reuse. Covered by 8 tests in `mobile/test/api_client_coalescing_test.dart`.
- `flutter analyze`: only the pre-existing `app_logger.dart` warning remains (baseline, not introduced by this change). `flutter test`: 91/91 passed.
- `npm run build` (Prisma generate + `tsc --noEmit` + `next build`) passed. `npm run test:mcp`: 31/31 passed (unaffected, unchanged area).
- Docker: found and fixed a **local-only** container-start blocker (`prisma.config.ts`/`tsconfig.json` copied without `--chown=node:node`, so an un-world-readable source file broke `prisma migrate deploy` under `USER node`) — confirmed via a clean `git clone` that HEAD's actual committed file modes are normal `644`, so this specific failure would not reproduce from a real CI/Railway build; hardened it anyway (all runner-stage `COPY --from=builder` lines now use `--chown=node:node`) since it's free, safe, and matches the existing `.next` copy's pattern.
- Discovered (not fixed — pre-existing, unrelated, out of scope): `npm run worker` fails to start on both the baseline and optimized images (`Error: Transform failed... Top-level await is currently not supported with the "cjs" output format` at `src/worker.ts:82`). Reproduces identically on the untouched baseline image. The Railway project has no separate worker service deployed, consistent with this. Flagged as a follow-up, not touched.
- Evaluated and **declined** (documented reasons, no code change): Next.js `output: "standalone"` (breaks the shared app/worker/maintenance-script image architecture; primary benefit is disk size, not RAM, since unrequired files were never loaded into memory anyway), image-proxy streaming (incompatible with the existing whole-blob AES-256-GCM authenticated encryption — GCM requires the full ciphertext+tag before releasing any plaintext), Sentry sampling-rate reduction (given CPU is already ~0 in measured Railway metrics, no evidence profiling is the RAM driver), Prisma connection pool / singleton changes (already correct, single instance, no N+1 queries found in `/api/meals` or `/api/water`).
- `APP_PUBLIC_URL` was already documented in `.env.example` and correctly wired with a graceful fallback + startup warning (`src/instrumentation.ts`, `src/app/api/app/version/route.ts`) — no code change needed; only a deployment-time action remains (set it on the Railway service).
