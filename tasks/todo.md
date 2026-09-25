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

# 2026-09-25 套件版本更新（npm / Flutter / Actions / Android）

## Goal + acceptance criteria

- [x] 把專案有使用的套件更新到「最新版本號」；本 repo 定義為**通過 7 天供應鏈冷卻期**的最新版（`.npmrc` `min-release-age=7`、`.github/dependabot.yml` `cooldown: default-days: 7`）。
- [x] `npm outdated` 與 `flutter pub outdated` 的直相依皆為空。
- [x] 不引入 breaking regression；所有既有測試、build、audit 需通過。

## Risk & rollback

- **Risk level:** medium（lockfile、Android toolchain、CI action pin）。
- **Affected components:** npm 依賴樹與 overrides、Flutter 相依、GitHub Actions pin、Android Gradle plugin/deps。
- **Rollback:** 還原 `package.json` / `package-lock.json` / `mobile/pubspec.yaml` / `mobile/pubspec.lock` / `mobile/android/{settings,app/build}.gradle.kts` / `.github/workflows/{docker-image,trivy}.yml` 即可（codeql.yml 已還原為 baseline）；未動任何 runtime 程式碼或 schema。

## Working notes

- [x] 以 registry `time` 欄位（非 dist-tags）逐一套件計算「冷卻期內最新版」，避免抓到剛發布的版本。
- [x] **Flutter 端未套用冷卻期（已決策：維持）。** `.npmrc` 的 `min-release-age=7` 只作用於 npm，`.github/dependabot.yml` 也只為 `npm`/`github-actions`/`docker` 宣告 cooldown（無 `pub` 生態）。`flutter pub upgrade --major-versions` 因此取到數個未滿 7 天的新版（`cached_network_image@4.0.2` 1.66d、`sentry_flutter@9.30.1` 2.98d、`flutter_cache_manager@3.4.5` 6.36d 等）。經確認使用者選擇**維持真正最新版**（Flutter 端不套用冷卻期）；`flutter analyze` / `flutter test` / `flutter build apk` 皆已驗證通過。註：`cached_network_image` 回退到 4.0.0 亦無法消除較新的 `material_ui`/`cupertino_ui` 傳遞依賴（實測 4.0.0 的 dependencies 與 4.0.2 完全相同）。
- [x] 冷卻期內無法升級而保留者：`@modelcontextprotocol/server` 2.1.0、`openai` 7.23.0、`next` 16.3.6、`bullmq` 6.3.8、`undici` 8.11.2、`eslint` 10.11.0、`dotenv` 18.0.3、`fast-uri` 4.2.1、`@types/node` 26.6.2。
- [x] Android：AGP 9.2+ 需 Gradle >= 9.4.1，而 Flutter 3.47.2 支援上限為 Gradle 9.3.1（實測 `Minimum supported Gradle version is 9.4.1`），故 AGP 維持 9.1.1（相容範圍內最新）。
- [x] Dockerfile base image 未動：`node:24.21.0-alpine3.24` 已是冷卻期內最新；npm 12.1.0 未滿 7 天且 bundled `brace-expansion` 未達註解門檻，patch 機制須保留。
- [x] compose 服務映像（postgres:17 / redis:7 / minio）**刻意未動**：屬本地開發基礎設施且為資料卷層級變更（PG18 `PGDATA` 改為 `/var/lib/postgresql/18/docker`，與現有掛載不相容；`minio/minio` 已從 Docker Hub 下架、quay 需認證）。

## Bugfix / 自我複查發現並修正

- **Repro:** `node -e 'require("minimatch")("a/b.txt","**/*.txt")'` → `TypeError: mm is not a function`。
- **Root cause:** 初版把 `eslint-config-next` → `minimatch` override 由 `^10.0.3` 提升為 `^10.2.6`，並一度收斂為全域 `minimatch` override，導致 npm 把 minimatch **10** hoist 給 `eslint-plugin-import` / `eslint-plugin-react` / `eslint-plugin-jsx-a11y`。這些 plugin 以**函式**方式呼叫 minimatch（v3 API），而 minimatch 10 的 CJS 匯出是 namespaced 物件（入口 `dist/commonjs/index.js`），故所有 pattern 規則呼叫都會 throw。
- **Baseline evidence:** 對 HEAD 做 `npm ci` 後由各 consumer 目錄解析：`eslint-config-next` → `v3.1.5 callable=true`；`eslint`/root → `v10.2.5 callable=false`。顯示該 override 在 baseline **未生效**。
- **Fix:** 移除該 override（一般 semver 已正確解析出 3.x for plugins、10.x for glob/eslint），回復 baseline 語意。（`@hono/node-server` override 同樣在 baseline 未生效，但未被引用且非本次目標，保留不動以免擴大變更範圍。）
- **Regression guard:** 修正後逐 consumer 目錄解析驗證 —— plugins `v3.1.5 callable=true works=true`、glob/eslint `v10.2.6` 以 `new Minimatch()` 正常運作。
- **另修:** `mobile/pubspec.yaml` 環境約束提升為 `sdk: ^3.13.0` + `flutter: ">=3.47.0"`（cached_network_image 4.x 經 material_ui/cupertino_ui 帶來的新下限），使 lockfile 的 `sdks` 變更成為明示而非隱含。

## Results

- **npm:** `npm outdated` 空；`npm audit` 0 vulnerabilities；`npm ci --dry-run` up to date；`npm run build`（prisma generate + tsc + next build）通過；`npm run test:mcp` 36/36；`npm ls --all` 與 baseline 同為既有 `webpack`/`typescript` 問題，且少一個 baseline 既有的 `invalid` minimatch 節點。
- **Flutter:** 直相依 all up-to-date；`flutter analyze` 僅既有 1 個 warning（`app_logger.dart:84`）；`flutter test` 91/91；`flutter build apk --debug` 與 `--release` 皆成功（含清空 Gradle build-cache 後重跑）。
- **Docker:** `docker build`（正式映像，含新 npm 依賴）成功。
- **CI:** 所有 workflow `actionlint` 通過。codeql-action 因 `v4.38.1` 僅 6.98 天（未滿 repo 7 天 cooldown）而**還原**為 baseline 的 `v4.38.0`（15.95 天，`b96794f…`）；docker-image.yml / trivy.yml 的兩個 SHA 則以 `git ls-remote` 驗證對應註解所述 tag（build-push-action v7.4.0、setup-buildx-action v4.4.1）。
- **Major bump 驗證:** `dotenv` 18（`dotenv/config` 匯出保留、實測載入 .env）；`fast-uri` 3→4（parse/serialize/resolve/equal 輸出鍵與 v3 相同，ajv 僅用這四者，$id/相對 $ref 解析實測正確）。
- **Android build 假警報:** 中途多次 `cannot find symbol` 失敗，經清空 `mobile/build` + `~/.gradle/caches/build-cache-1` + `gradlew --stop` 後完全重跑即成功，確認為本機陳舊 Gradle 快取狀態，非相依變更造成（CI 使用全新快取）。
# 2026-09-25 修復 APP 內建更新切換畫面時的下載錯誤

## Goal + acceptance criteria

- [x] 定位離開更新畫面、切換其他頁面時的錯誤來源；用 widget test 重現跨頁對話框回報。
- [x] 切換頁面不產生虛假的下載失敗；真實失敗留在更新視窗內且可重試。
- [x] Android 更新持續使用背景 worker，完成時由安裝程式或系統通知提示。
- [x] 加入回歸測試，執行 Flutter 測試、靜態分析與 Android debug APK 建置。

## Risk & rollback

- **Risk level:** medium（Android 背景下載與更新 UI 狀態）。
- **Affected components:** `mobile/lib/services/update_service.dart`、`mobile/lib/widgets/update_card.dart`。
- **Rollback:** 還原本節對應程式變更即可；沒有資料遷移。

## Working notes

- Android 下載由 `flutter_downloader` 背景工作回報；`_DownloadDialog` 監聽 `UpdateService.status`。
- `canceled` 曾被映射為 `failed`；listener 在關閉動畫期間仍可操作目前 Navigator，且 SnackBar 會跨 Dashboard 分頁顯示。
- `IndexedStack` 保留隱藏分頁的 context；`mounted` 不足以判斷是否仍在當前分頁，改用 `Visibility.of(context)`。
- Android 背景 worker 失敗後原本會切到行程內 Dio，會破壞離開 APP 後持續下載的保證；現在重試一次背景工作後回報可重試的真實錯誤。

## Results

- `mobile/lib/services/update_service.dart`：區分取消與失敗，移除 Android 前景 Dio fallback；背景完成仍沿用既有安裝程式／通知流程。
- `mobile/lib/widgets/update_card.dart`：下載對話框先顯示再啟動；視窗內顯示失敗與重試；關閉後忽略遲到事件，不再跨頁顯示錯誤。
- `mobile/test/update_dialog_test.dart`：4 個更新狀態、離頁、跨頁回歸測試通過。
- `docs/features.md`：更新背景下載與完成通知的功能描述。
- `flutter test --no-pub`：95/95 通過。`flutter analyze --no-pub`：僅既有 `app_logger.dart:84` 警告。`flutter build apk --debug --no-pub`：成功。
- 沒有連接的 Android 裝置／模擬器；背景下載完成通知與安裝提示尚未做實機驗證。
# 2026-09-25 健康同步資料完整性與熱量／飲水自動上傳

## Goal + acceptance criteria

- [x] 找出健康同步漏傳與舊值殘留的確切程式路徑。
- [x] 餐點熱量建立、修改、刪除及飲水新增、刪除成功後，自動同步受影響日期的雲端健康日總；快速連續變更合併處理。
- [x] 某日資料讀取失敗不得被當作完整同步成功；刪光當日資料須把雲端日總更新為 0。
- [x] 保持餐點／飲水儲存成功與健康同步失敗彼此獨立，並提供可診斷的同步失敗紀錄。
- [x] 加入回歸測試，執行 Flutter 測試／分析與相關建置。

## Risk & rollback

- **Risk level:** medium（健康資料上傳、自動網路請求及日總覆寫）。
- **Affected components:** Flutter 健康同步、餐點與飲水異動入口；如需調整伺服器會另列。
- **Rollback:** 還原本節的健康同步和觸發器變更；沒有資料表遷移。已上傳的每日 0 值可由再次完整同步修正。

## Working notes

- `fetchRecentMeals`/`fetchRecentWaterLogs` 目前逐日讀取失敗即略過，可能回報「成功」但缺日；一般讀取也可能使用離線快取。
- 雲端 `/api/health/sync` 只 upsert；既有彙整忽略 0，刪光某日後會殘留舊熱量／飲水值。
- `/api/health/sync` 每使用者每小時 30 次；自動上傳需合併短時間的修改，且不能在每次儲存時要求 Health Connect 權限。
- 已向使用者釐清是否也要同步 Health Connect／Samsung Health；雲端日總修正可獨立進行。
- 飲水桌面小工具直接呼叫後端，無法觸發 Flutter 變更通知；APP 開啟／恢復時補對今天與昨天。
- 健康卡顯示自動上傳失敗／重試中，成功後重讀狀態；本次自動路徑不要求 Health Connect 權限。
- Health Connect 寫入仍沿用現有手動同步流程，是否要連同自動寫入待使用者回覆釐清。

## Results

- `mobile/lib/services/health_service.dart`：健康資料逐日讀取改走最新網路回應，失敗或格式不完整即中止；手動同步的餐點／飲水日總含 0；新增受影響日期的自動上傳並驗證後端筆數。
- `mobile/lib/services/health_auto_sync.dart`：3 秒合併、每 2 分鐘最多一次嘗試、失敗重試、依帳號保存待補日期並在重開 APP 時續傳；餐點／飲水儲存不等待健康上傳。
- 餐點新增／修改／刪除與飲水新增／刪除接上自動上傳；APP 進入／恢復補對最近兩天，涵蓋桌面飲水小工具；健康卡顯示重試提示。
- `mobile/test/health_auto_sync_test.dart` 等：涵蓋更新熱量、刪至 0、短時間合併、上傳期間再變更、節流、失敗重試、跨重啟補傳與帳號隔離、逐日失敗與格式錯誤、Fresh GET 不共用快取請求。
- `flutter test --no-pub`：108/108 通過。`flutter analyze --no-pub`：僅既有 `app_logger.dart:84` 警告。`flutter build apk --debug --no-pub`：成功。`git diff --check`：通過。
- `adb devices` 顯示沒有已連接 Android 裝置；實機 Health Connect／桌面小工具行為尚未驗證。

# 2026-09-26 發佈 APP 更新修復與健康自動同步（v0.78.0）

## Goal + acceptance criteria

- [ ] 將本工作樹中已完成的 APP 更新修復與健康同步變更提交至 `main`。
- [x] 依建議版本更新 `mobile/pubspec.yaml`（`0.78.0+127`），準備 `v0.78.0` tag。
- [ ] 建立 GitHub Release，確認 Android CI 完成並驗證遠端 main/tag/release。

## Risk & rollback

- **Risk level:** medium（Android 發佈與共用版本 tag；tag 也會觸發 Web 映像 CI）。
- **Affected components:** Flutter Android APK、GitHub `main`、版本 tag 與 Release。
- **Rollback:** 可刪除尚未公開的 Release/tag 並 revert main commit；S3 APK 發佈若已完成需重新發布前一版 APK。

## Working notes

- 發佈前本機 `main` 與已 fetch 的 `origin/main` 同為 `25d72e7`，工作樹變更只含先前已完成的更新修復與本次健康同步。
- 專案最新 tag/release 是 `v0.77.3`；`release-android` 技能要求未指定版本時向使用者詢問。已提出 `v0.78.0`（功能升 minor，建議）或 `v0.77.4`（patch）選項。
- GitHub Release workflow 不會由 tag 自動建立 GitHub Release；Android CI 會建置簽章 APK 並上傳 S3，Docker workflow 亦會由共同 tag 觸發。
- GitHub CLI 目前 token 無效；外網讀取已透過核准的 `git fetch`/公開 API 驗證可用。正式 push／建立 Release 仍待執行與驗證。

## Results

- 待發佈版本選擇與遠端操作完成後更新。
