# 2026-09-09 GitHub Security and quality 修復

## Goal + acceptance criteria

- [x] 完成本機對應目前 GitHub Security alerts 的修復，並確認 CodeQL/secret-scanning 沒有 open alert；Dependabot 需在推送後重新評估。
- [x] 修復依賴鏈中的 `mysql2` 安全漏洞，且不引入不必要的直接生產依賴。
- [x] 同步處理本機 `npm audit` 已證實的 `sharp` 漏洞。
- [x] 不改動使用者既有的 `Dockerfile`、`README.md`、`changelog.json` 模式變更。
- [x] 通過 lockfile 一致性、TypeScript/build、MCP 測試與 GitHub alerts 重新查詢（MCP 原始命令另有本機 Node ENOMEM，見 Results）。

## Risk & rollback

- **Risk level:** medium（依賴版本與 Prisma 生成/建置鏈）。
- **Affected components:** npm lockfile、Prisma CLI/client 的相依解析、Next.js `sharp` runtime dependency、server-side outbound fetch、water/health API、Android CI release boundary。
- **Rollback:** 保留本次變更的精確 diff；若 build/測試回歸，還原本次修復檔案與 package manifest/lockfile 變更，不碰既有工作樹修改。
- **Operational note:** 不會關閉或 dismiss GitHub alert；以版本修復讓 Dependabot 自動重新評估。

## Dependencies & environment

- Node/npm：使用目前工作樹既有版本與 `package-lock.json`。
- GitHub：唯讀查詢 `code-scanning`、`dependabot`、`secret-scanning` alerts；不推送、不修改遠端設定。
- 環境證據：2026-09-09 GitHub CodeQL open alerts = 0、Secret scanning alerts = 0；Dependabot open alerts 為 `mysql2` #31/#34。

## Working notes

- [x] 完成安全掃描能力預檢：`security_scan` ready，delegated workers 可用。
- [x] TAC advisory：`not_granted`；受保護掃描輸出可能不可用，改以本機 source-backed review 與 GitHub API 證據驗證。
- [x] 確認 `mysql2@3.15.3` 由 `prisma@7.10.0` 引入；GitHub 修復版本為 `3.22.0`/`3.23.1`。
- [x] `npm audit --audit-level=high` 顯示另外有 `sharp@0.35.3`，修復版本需 `>=0.35.4`。
- [x] source-backed review 確認兩處 DNS rebinding SSRF、water 無界資源使用、health history 重複查詢放大，以及 Android PR workflow 秘密暴露邊界。
- [x] 以 `undici@8.10.2` 的自訂 connector 在 TLS SNI 保留原 hostname、socket 固定至 DNS 驗證後的 public IP；每個 agent 限制單一 request。

## Checkpoints

- [x] A：確認告警與實際依賴樹，決定最小版本修復方式。
- [x] B：更新 manifest/lockfile，執行 targeted verification。
- [x] C：完成 source-backed security review 與 full verification。
- [x] D：重新查詢 GitHub alerts，記錄結果與未能驗證的項目。

## Results

- **Remote alert evidence (2026-09-09):** CodeQL open alerts `[]`；secret-scanning open alerts `[]`；Dependabot open alerts 為 #31 `mysql2` (`GHSA-3f6p-5ww8-9rcr`, patched `3.22.0`) 與 #34 `mysql2` (`GHSA-rgwj-5xj2-c3m3`, patched `3.23.1`)。本次未 push 或 dismiss alert，所以兩筆會在推送後由 GitHub 重新評估。
- **Dependency fix:** `package.json` 加入 `mysql2: ^3.23.1` override、將 `sharp` override 提升至 `^0.35.4`，並加入必要的 server-only `undici: ^8.10.2`；lockfile 實際解析為 `mysql2@3.24.4`、`sharp@0.35.4`、`undici@8.10.2`。
- **SSRF fix:** `src/lib/url-guard.ts` 將 hostname 解析、private/reserved IPv4/IPv6 判定與實際 TCP/TLS connector 綁在一起；`src/lib/ai.ts` 與 MCP meal image fetch 共用；保留 HTTPS、TLS SNI、redirect blocking 與 response size/type 防護。
- **Resource-bound fix:** `/api/water` 加入 per-user read/write rate limit、單日 500 筆上限、bounded `findMany` 與 aggregate total；dashboard 同步 bounded。health history 加入 rate limit、raw query 長度上限、類型去重與最多 5 種限制。
- **CI trust-boundary fix:** `.github/workflows/android-apk.yml` 以 secret-free PR debug build 取代 PR release path；簽名、OAuth config、S3 endpoint/credentials 只在 main/version-tag trusted release job/steps 使用。
- **Verification:** `npm.cmd ci --dry-run --ignore-scripts --no-audit --no-fund` pass；`npm.cmd ls undici mysql2 sharp --all` clean；`npm.cmd audit --audit-level=high` → `found 0 vulnerabilities`；`npm.cmd run build` pass（Prisma generate、TypeScript、Next production build、43/43 pages）；DNS-pinned `https://example.com/` runtime check → HTTP 200；MCP suite 在一次性 test-only Node shim 下 `36/36` pass。
- **Environment limitations:** 原始 `npm.cmd run test:mcp` 在 tsx 載入前即因 Node 24 `uv_os_get_passwd returned ENOMEM` 導致 8/8 啟動失敗；`npm.cmd run lint` 仍是既有的 Next 16 `next lint` 過時 script（`Invalid project directory ...\\lint`）；`actionlint` 與 Python YAML parser 未安裝，workflow 以人工 diff 檢查，未宣稱 actionlint 通過。

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
