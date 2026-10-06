# 2026-10-06 新增週報 AI 摘要（issue #161，feature-gap-analysis C3）

## Goal + acceptance criteria

- [x] 擴充 `src/worker.ts` 既有 BullMQ 每小時排程，新增 `precompute-weekly-summaries`，對**本地時間為週一凌晨 1 點**的使用者產生上一個 Mon–Sun 週的摘要。
- [x] 重用既有管線：`withAgent` / `completionOptions({ json: true })` / `renderPrompt`，prompt 以 `AI_WEEKLY_SUMMARY_PROMPT` 覆寫（比照 `AI_DAILY_SUMMARY_PROMPT`）。
- [x] 新增 `WeeklySummary` 表（`(userId, weekStart)` 唯一），沿用 `encryptDailySummaryWrite` 的加密模式；Web／App 讀取時不跑即時 AI（peek）。
- [x] 冪等：既有列直接回傳、`P2002` 併發插入回讀既有列，worker 重啟不重複產生。
- [x] 時區一律走 `TzSpec`（`weekStartStr` / `weekRangeUtc`），不以伺服器 UTC 判斷「上週」。
- [x] `npm run build`（`prisma generate` + `tsc --noEmit` + `next build`）與既有測試套件通過。

## Risk & rollback

- **Risk level:** medium（新增資料表 + 背景 AI 花費路徑；無破壞性變更）。
- **Affected components:**
  - `prisma/schema.prisma`、`prisma/migrations/20261006000000_add_weekly_summary/`
  - 新增 `src/lib/weekly-summary-stats.ts`（純聚合）、`src/lib/weekly-summary.ts`（DB/AI 編排）、`src/app/api/weekly-summary/route.ts`
  - `src/worker.ts`、`src/lib/ai.ts`、`src/lib/b2-crypto.ts`、`src/lib/admin-export.ts`（匯出/匯入）
  - `src/app/dashboard/page.tsx`（`AiInfoCard` 週檢視）、`mobile/lib/*`（models／service／dashboard 週檢視卡片）
  - 文件：`.env.example`、`README.md`、`docs/features.md`
- **Rollback:** 還原此 PR；migration 只新增一張表，回滾時 `DROP TABLE "WeeklySummary"` 即可，不影響既有資料。
- **AI 花費風險:** 週報只在「上週有餐點」且「使用者有 AI 金鑰」時產生，且每週每位使用者最多一次（唯一鍵）；on-demand 路徑另受 `enforceAiRateLimit` 與跨站防護限制。

## Dependencies & Environment

- 未新增任何相依套件。
- 新增環境變數（皆為選填）：`AI_WEEKLY_SUMMARY_PROMPT`、`AI_WEEKLY_SUMMARY_MAX_TOKENS`（預設 1200）。
- 需要 Redis（BullMQ，既有）與 PostgreSQL（migration）。

## Working notes

- **為何獨立表而非沿用 `DailySummary`:** 週報多出飲水總量與體重趨勢欄位，且生命週期不同（每日 vs 每週）；獨立表讓 `(userId, weekStart)` 唯一鍵直接承擔冪等，不必把週鍵硬塞進 `summaryDate`。
- **為何純聚合要獨立成 `weekly-summary-stats.ts`:** `src/lib/weekly-summary.ts` 需要 `server-only` 與 DB；把 `weekWindow`／`aggregateWeek` 抽成無相依模組後可用 `node --test` 直接驗證時區邊界。
- **為何 worker 用「本地週一 1 點」而非 cron 週一:** 沿用每日任務的 `hourInTz` 手法，跨時區不需要為每個時區各註冊一條排程，也不會在伺服器 UTC 週一誤判使用者的「上週」。判斷條件用 `todayStr(tz) === weekStartStr(todayStr(tz))`（週一即為自己的週起始），免去額外 weekday helper。
- **平均值一律除以 7 天:** 與 web 週檢視的 `totals / 7` 一致；只記錄 3 天的一週會如實呈現為低攝取週，而不是被重新正規化。
- **體重趨勢需要兩筆:** 只有一天有讀值時 `weightStart/End/Change` 皆為 null，prompt 顯示「本週未同步」／「無法計算」，不從單點捏造趨勢。
- **冪等重建:** `generateAndStoreWeeklySummary` 先查既有列；create 若撞 `P2002`（worker 與 on-demand 併發）則回讀既有列。
- **admin 匯出/匯入:** 新增 `weeklySummaries` 表，`skip-existing` 以 `(userId, weekStart)` 找既有列、`overwrite` 走 `upsert`，與 `dailySummaries` 同模式，避免備份還原遺失週報。

## Results

- `npm run build`：通過（`tsc --noEmit` 乾淨、`next build` 路由表含 `/api/weekly-summary`）。
- `node --import tsx --test tests/insights/*.test.ts tests/dates.test.ts`：14/14 通過（新增 6 個週報案例：視窗對齊、跨月、聚合、空週、跨週邊界排除）。
- `npm run test:mcp`：36/36 通過；`npm run test:storage`：19/19 通過。
- `flutter pub get` + `dart analyze`（3 個改動檔）：No issues found。
- Migration 驗證（拋棄式 postgres:18-alpine，port 55432）：`prisma migrate deploy` 全部套用成功；`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` 顯示 `WeeklySummary` 與 schema 零差異（唯一差異是既有的 `AppConfig.updatedAt` baseline，先前即存在）。
- 執行期驗證（拋棄式 DB + `tsx`）：7 天資料的 `collectWeeklySummaryStats` 回 `daysLogged=7`、`totals={3710,210,105,350}`、`waterTotalMl=7000`、`avg.calories=530`、`weight 70→71.2`；既有列時 `generateAndStoreWeeklySummary` 直接回傳同一列（未花 AI）；空週回 `null`；刪除使用者後 `WeeklySummary` 隨 FK cascade 清除。
- Worker 觸發驗證（`tsx`）：台北週一 01:00 → 動作且 `lastWeekDate=2026-09-28`；週一 02:00／週二 01:00／週日 01:00 → 不動作；`America/New_York` 週一 01:00（UTC 05:00）亦正確。
- Prompt 變數檢查（腳本比對 `{{...}}` 與傳入值）：19 個 placeholder 全部有對應值，無未解析殘留。
# 2026-10-05 升級 Sentry JS SDK 10.75 → 11.0（合併 #148／#149）

## Goal + acceptance criteria

- [x] 把 `@sentry/nextjs` 與 `@sentry/profiling-node` 一起升到 11.0.0（兩者必須同版），取代兩個各自失敗的 Dependabot PR（#148、#149）。
- [x] 依官方 v10→v11 migration guide 修掉所有 breaking change。
- [x] **維持既有的隱私基線**：v11 把 `dataCollection` 預設改成「全部收集」，必須明確關回不送出使用者內容。
- [x] `npm run build`（`prisma generate` + `tsc --noEmit` + `next build`）、`test:mcp`、`test:nouriledger` 通過。

## Risk & rollback

- **Risk level:** medium（可觀測性套件大版號；無 schema／資料變更）。
- **Affected components:** `package.json`、`package-lock.json`、`next.config.ts`、`sentry.server.config.ts`、`sentry.edge.config.ts`、`src/instrumentation-client.ts`，新增 `src/lib/sentry-privacy.ts`。
- **Rollback:** 還原此 PR 即回到 10.75.0；沒有資料遷移或 schema 需要回復。
- **隱私風險（升級當下才出現）:** 見下方 Working notes。

## Dependencies & Environment

- v11 需 Node `>=20.19.0 <22.0.0 || >=22.12.0`：CI 用 Node 22、Dockerfile 用 `node:24.21.0`，皆在範圍內（**22.12 為下限，不是 22.0**）。
- 未新增相依；`@sentry/profiling-node` 仍保留（原生繫結，`serverExternalPackages` 不變）。

## Working notes

- **v11 breaking changes 與本專案對應修法**
  - `withSentryConfig` 移到子路徑 → `@sentry/nextjs/config`。
  - `enableLogs` 移除 → 直接刪除；有加 `consoleLoggingIntegration()` 就會送 log。
  - `nodeProfilingIntegration()` 型別簽章改變（`Integration & { name }` 與 `Integration` 衝突）→ 直接沿用，型別現在可通過；`profiler()` 是 `@sentry/node` 的手動生命週期 API，不是替換品。
  - `disableLogger` → `webpack.treeshake.removeDebugLogging`。
  - `streamGenAiSpans` 移除（GenAI span 一律串流，本來就是 true）。
  - `sendDefaultPii` → `dataCollection`，且**預設由保守翻轉為全收**（userInfo／cookies／httpBodies／databaseQueryData／queues／stackFrameVariables／genAI 輸入輸出）。本專案把 v10 的保守基線寫進 `src/lib/sentry-privacy.ts` 並在三個 runtime（server／edge／client）共用。
- 選 `11.0.0` 而非最新 11.x：repo 有 7 天 `min-release-age` 冷卻期與 `.github/dependabot.yml` cooldown；今天只有 11.0.0 通過冷卻期，與 Dependabot 原本提議的版本一致。之後可再走一次群組升級。

## Results

- `npm run build`：通過（`tsc --noEmit` 乾淨、Next.js 路由表完整、無 deprecation／removed-option 警告）。
- `npm run test:mcp`：36/36 通過；`npm run test:nouriledger`：8 通過、13 略過（未設 `FOOD_TEST_DATABASE_URL`）。
- 執行期驗證（拋棄式 `tsx`）：`Sentry.getClient().getOptions().dataCollection` 解析後 `genAI.inputs=false`、`httpBodies=[]`、`databaseQueryData=false`、`stackFrameVariables=false`；server config 的 integrations 含 `ProfilingIntegration`、`ConsoleLogs`、`OpenAI`，`profileLifecycle='trace'`、`profileSessionSampleRate=1`。
- 用戶端：Session Replay／瀏覽器 profiling 的程式碼仍在 client chunk（升級後兩者都是頂層匯出，原本「只在 client build」的行為未改變）。



## Goal + acceptance criteria

- [x] 使用者在設定頁按一個按鈕 → 新站（Google 登入、確認「舊帳號 → 新帳號」）→ 新站以伺服器對伺服器方式取回**該使用者自己的資料與照片**。
- [x] 未設定 `NOURILEDGER_ORIGIN` 時功能完全關閉：按鈕不顯示、三個端點回 404。
- [x] 匯出只含登入者本人；不含個人 AI 金鑰、Google ID、管理員旗標、tokenVersion；管理員整庫匯出行為不變（有回歸測試）。
- [x] 授權碼：HMAC 簽章、綁定使用者／tokenVersion／新站 origin／PKCE challenge，10 分鐘、匯出單次使用；「登出所有裝置」會讓尚未兌換的 code 失效。
- [x] 讀不到的照片不擋住匯入，改為警告並從 JSON 移除懸空 key（引擎遇到缺附件的 key 會整批失敗）。
- [x] 不需要資料庫變更、不新增相依。

## Risk & rollback

- **Risk level:** high（認證流程、個資外送、跨系統）。預設關閉，需同時在新站設定來源才會運作。
- **Affected components:** `src/lib/admin-export.ts`（新增**可選**的 `ExportScope`，admin 路徑不變）、`src/lib/nouriledger-handoff.ts`／`-grant.ts`／`-export.ts`、`src/app/api/migration/nouriledger/*`、登入頁 `next` 白名單、Google 登入按鈕（`/api/` 目標改硬導向）、設定頁卡片。
- **Rollback:** 清空 `NOURILEDGER_ORIGIN` 並重啟即關閉；或還原本分支。沒有 schema／資料遷移需要回復。

## Dependencies & Environment

- 新環境變數：`NOURILEDGER_ORIGIN`（見 `.env.example`）；簽章金鑰由既有 `AUTH_SECRET` 衍生。
- 新站需設定 `NOURILEDGER_IMPORT_SOURCES`（含此站的 `origin` 與穩定的 `instance` 代碼），且新站 `APP_URL` 須等於此處的 `NOURILEDGER_ORIGIN`。

## Working notes

- 設計：新站發起的 authorization code + PKCE（S256）。新站只信任管理員設定的來源網址（無 SSRF），不需共享密鑰；PKCE verifier 只存在新站伺服器，所以從網址外洩的 code 沒有用。
- code 是無狀態 HMAC 權杖，單次使用只在記憶體強制（verifier 要求與 10 分鐘壽命限制了重啟後的重放空間）；刻意不加資料表。
- 這台 Windows 開發機的 `node_modules` 是在 macOS 安裝的（只有 darwin 原生套件），且位於 Synology 同步資料夾——**不要在此資料夾執行 `npm ci`**，以免把 Windows 套件同步回 Mac。驗證改在同步資料夾外的拋棄式 clone 進行。
- DB 相關測試需自行提供拋棄式 PostgreSQL：`FOOD_TEST_DATABASE_URL=postgresql://…@127.0.0.1:…/food_diary_test`（先 `prisma migrate deploy`）；未設定則自動跳過。

## Results

- `npm run test:nouriledger`：19 項（8 項純函式 + 11 項 DB 測試）全部通過；未設定 DB 時 11 項 DB 測試自動跳過、不失敗。
- 既有 `npm run test:mcp` 36 項仍全數通過；`npm run build`（`prisma generate` + `tsc --noEmit` + `next build`）通過，三個新端點都在路由表中。
- 正式模式（`next start`）冒煙：`userinfo` 200；`export` 200（`multipart/form-data`、`no-store`），只含本人 1 位使用者、`appConfig` 為空、無 AI 金鑰、無他人 ID；同一個 code 第二次兌換回 400 `invalid_grant`。
- 三站端對端（Food + AssetPilot + NouriLedger，真實 Chromium，合成資料）11/11 通過：設定頁按鈕 → 新站確認頁（舊帳號 → 新帳號與筆數）→ 匯入；照片逐位元組相同、Alice 的 AI 金鑰與 Bob 的資料都沒有進新站；重跑新增 0 筆；callback 網址不可重放；偽造 callback／他人 state 皆被拒；未登入時新站與舊站登入頁都會記住返回位置；深色＋手機寬度畫面正常。
- **未驗證**：真實 Google／LINE 登入、正式網域與 TLS、NAS 容器經公開網址互連（必要時在新站設定 `serverOrigin`）、正式資料量下的耗時、Android App。
- 發版：Web／Mobile 版本號 0.79.2 → 0.80.0（`mobile/pubspec.yaml` 0.80.0+131；App 本身沒有功能變更，只隨同一個 tag 同步版本）。
- 合併：PR #145 已 squash-merge 到 `main`，提交 `aaa281d22219bb9e4223113582137adff3cf86d2`；合併內容已包含請求本文限制、照片並行上限，以及超限時保留 keep-alive 連線的修正。
- 發版完成：tag `v0.80.0` 指向上述 `main` 提交；GitHub Release：[v0.80.0｜舊站一鍵匯入 NouriLedger](https://github.com/es94111/AI_Food_Diary/releases/tag/v0.80.0)。
- 發版 CI：Docker workflow `37191769208` 成功，推送 `0.80.0`／`latest` image 並建立 Sentry release；Android workflow `37191769211` 成功，建置 APK 並上傳版本 APK 與 latest APK 至 S3。

# 2026-10-03 修復 Next.js Dependabot Critical Alert #39

## Goal + acceptance criteria

- [x] 確認 GitHub advisory 指出 `next` `<16.3.6`，修復版為 `16.3.6`；專案目前 lock 在 `16.3.5`。
- [x] 搜尋確認專案未使用 `next/og` 或 `ImageResponse`。
- [x] 將 Next.js 與 lockfile 更新至修復版，避免不相關依賴升級。
- [x] 執行依賴稽核與相關建置/測試。
- [x] 準備可審查的修補。
- [x] 確認後續發版版本為 `0.79.2`。
- [x] 更新 Web/Mobile 版本與 Android build number `130`。
- [x] 提交並推送 `main`，推送 tag `v0.79.2` 並建立 GitHub Release。
- [x] 驗證 Dependabot Critical alert 已標示 fixed。
- [x] 確認 v0.79.2 Android APK 與 Docker tag CI 成功。

## Risk & rollback

- **Risk level:** high（GitHub 標示 Critical 的 Next.js runtime dependency advisory）。
- **Affected components:** Next.js runtime 與 npm lockfile。
- **Rollback:** 若修復版造成建置或運行回歸，回退程式碼相容性問題，但不要重新發布含有已知受影響 Next.js 版本的 production image。

## Working notes

- GitHub Dependabot alert #39：`GHSA-vcvr-r3jv-pc5j`；首個修復版 `16.3.6`。Advisory 的 RCE 影響面是 Node.js `next/og` ImageResponse 的攻擊者可控 SVG 輸入；本 repo 搜尋沒有使用該 API，但仍更新依賴以清除此 Critical alert。

## Results

- `package.json`/`package-lock.json` 僅將 Next.js 與其 SWC/env 子套件由 `16.3.5` 更新為修復版 `16.3.6`。
- `npm run build` 通過（Next.js `16.3.6`，43/43 靜態頁完成）；`npm audit --omit=dev --audit-level=high` → `found 0 vulnerabilities`。
- 全相依樹 `npm audit` 仍報 5 個 High `braces` advisories，路徑在 ESLint 開發工具鏈；沒有 Critical advisory。
- 使用者確認後續安全修補發版為 `v0.79.2`。
- GitHub Dependabot alert #39 在推送修復版後回報 `state=fixed`（2026-10-03T13:37:47Z）。
- Commit `9439b76` 已推送到 `main`；tag `v0.79.2` 與 Release 已建立：[GitHub Release v0.79.2](https://github.com/es94111/AI_Food_Diary/releases/tag/v0.79.2)。
- Android tag workflow `37126847412` 成功，release APK 已建置並由 `Upload APK to S3` 步驟發布；Docker tag workflow `37126847349` 成功（含 image push 與 Sentry release）。
- 發版提交及後續文件提交各自觸發的 main Android workflow `37126818412`、`37127321629`，曾與 tag run 同時發布相同版本與 `latest` S3 路徑；為避免重複寫入，取消這兩個 main run，保留並確認 tag 發版 run 成功。文件提交只記錄結果，不影響 v0.79.2 程式碼與 tag。

# 2026-10-03 修復健康同步 token 洩漏至日誌

## Goal + acceptance criteria

- [x] 移除健康同步裝置註冊回應中的敏感內容，只保留 HTTP 狀態碼。
- [x] 保留 token 取得與 Flutter Secure Storage 儲存行為。
- [x] 加入回歸測試，證明 token 不會出現在 debug 或持久化日誌。
- [x] 執行目標 Flutter 測試與 analyzer，檢查最終 diff。

## Risk & rollback

- **Risk level:** medium（健康同步憑證與日誌處理）。
- **Affected components:** Flutter `HealthService` token 註冊與手機端同步診斷日誌。
- **Rollback:** 若驗證出現同步回歸，還原本節所列的服務與測試檔案 diff。

## Working notes

- 註冊 API 回傳可授權健康資料讀寫的 bearer token；日誌由健康同步卡片提供檢視/分享。
- 僅移除兩個 sink 的 response body，狀態碼與 token 安全儲存流程維持不變。

## Results

- `flutter test test/health_service_token_logging_test.dart` 通過；回歸測試確認 token 仍回傳並寫入 `hcs_token` 安全儲存，但不出現在 debug 輸出或持久化日誌。
- 完整 `flutter test` 通過（109 tests）；針對修改檔案的 `flutter analyze lib/services/health_service.dart test/health_service_token_logging_test.dart` 通過。
- 全套 `flutter analyze` 目前有一筆既存警告：未修改的 `lib/services/app_logger.dart:84` `unawaited_return_in_try_block`；`git diff --check` 通過。
- 註冊流程今後只記錄狀態碼。先前版本已寫入裝置的歷史日誌不會由此修補自動清除；若舊日誌曾被分享，應撤銷該同步裝置 token。

## Release v0.79.1

- [x] 確認目標版本為 `0.79.1`（最新 tag `v0.79.0` 的安全修補版）。
- [x] 更新 `package.json` 與 `mobile/pubspec.yaml`（build number `129`）。
- [x] 提交並推送 `main`。
- [x] 建立並推送 `v0.79.1` tag，建立 GitHub Release。
- [x] 確認 GitHub Release 與 tag 指向提交，並確認 tag CI 成功。

- **Risk / rollback:** tag 會觸發 Android APK 發布與 Docker image 推送；若發版產物有問題，修正後發下一個 patch 版並回滾/重新部署前一個 Docker image tag。
- **Release evidence:** `fbade5e` pushed to `main`; remote `v0.79.1` points to the same commit; [GitHub Release v0.79.1](https://github.com/es94111/AI_Food_Diary/releases/tag/v0.79.1) is published with Traditional Chinese notes.
- **CI evidence:** Docker image workflow `37125799266` succeeded; Android APK workflow `37125799260` succeeded, including S3 upload. Docker workflow reported the existing Sentry action `version` input deprecation warning.

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

- [x] 將本工作樹中已完成的 APP 更新修復與健康同步變更提交至 `main`。
- [x] 依建議版本更新 `mobile/pubspec.yaml`（`0.78.0+127`），準備 `v0.78.0` tag。
- [x] 建立 GitHub Release，確認 Android CI 完成並驗證遠端 main/tag/release。

## Risk & rollback

- **Risk level:** medium（Android 發佈與共用版本 tag；tag 也會觸發 Web 映像 CI）。
- **Affected components:** Flutter Android APK、GitHub `main`、版本 tag 與 Release。
- **Rollback:** 可刪除尚未公開的 Release/tag 並 revert main commit；S3 APK 發佈若已完成需重新發布前一版 APK。

## Working notes

- 發佈前本機 `main` 與已 fetch 的 `origin/main` 同為 `25d72e7`，工作樹變更只含先前已完成的更新修復與本次健康同步。
- 專案最新 tag/release 是 `v0.77.3`；`release-android` 技能要求未指定版本時向使用者詢問。已提出 `v0.78.0`（功能升 minor，建議）或 `v0.77.4`（patch）選項；等待期間採用建議的 `v0.78.0`。
- GitHub Release workflow 不會由 tag 自動建立 GitHub Release；Android CI 會建置簽章 APK 並上傳 S3，Docker workflow 亦會由共同 tag 觸發。
- 已使用系統 GitHub 憑證完成 CLI 登入；`main` 推送、`v0.78.0` tag 推送與正式 Release 建立均成功。

## Results

- Commit `3200244f0529c087d61881853933068530c82ec6`（`chore: release v0.78.0`）已推送至 `main`；tag `v0.78.0` 與遠端 `main` 均指向此 commit。
- 正式 GitHub Release：[v0.78.0｜APP 自更新與健康同步修復](https://github.com/es94111/AI_Food_Diary/releases/tag/v0.78.0)。APK 不附在 GitHub Release，Android CI 已成功上傳 `ai-food-v0.78.0.apk` 及 `ai-food-latest.apk` 至 S3。
- Android APK workflow `36160067298` 與 Docker image workflow `36160067229` 均以 `success` 結束。
- 發佈前 `flutter test --no-pub`：108/108 通過；`flutter analyze --no-pub` 只有既有 `app_logger.dart:84` 警告；debug APK build 與 `git diff --check` 通過。

# 2026-09-27 網站風格與 UI 更新

## Goal + acceptance criteria

- [x] 盤點現有 Web 頁面、共用樣式與產品設計約束。
- [x] 將公開首頁與登入頁更新為與工作台一致的視覺語言；保留既有導向、Google SSO 與 Turnstile 流程。
- [x] 改善共用導覽與互動狀態，維持桌面與手機可用性及鍵盤焦點可見性。
- [x] 驗證桌面/手機版面、TypeScript/建置及 diff 品質。
- [x] 記錄結果與未驗證項目。

## Working notes

- Web 入口為 `src/app/page.tsx`、`src/app/login/page.tsx`、`src/app/dashboard/*`，共用 token 在 `src/app/globals.css`。
- 工作台已採暖米色畫布、深炭色側欄、琥珀/陶土/橄欖色系；首頁與登入頁仍採較舊的獨立樣式。本次延伸既有世界，統一公開頁與操作介面。
- 文案依專案規範使用台灣繁體中文、溫和不評判的語氣；示範營養數字必須清楚標示為示意。
- 風險低：限定 Web 視覺與可及性；不改資料模型/API/驗證流程。若出現回歸，可還原本次 Web UI 檔案。

## Results

- `src/app/page.tsx` 與 `src/app/login/page.tsx` 改用工作台現有的暖色、深炭色和共用品牌標記；首頁以標示為示意的餐點照片與可確認 AI 草稿呈現產品流程。圖片儲存在 `public/images/meal-journal.jpg`。
- 工作台加入依路由更新的麵包屑與跳到主要內容連結；移除無實際同步訊號支持的「資料同步正常」文案。登入頁保留 `safeNextPath`、Google SSO 與 Turnstile，並處理窄螢幕驗證元件與 Google 按鈕寬度。
- 視覺檢查：開發伺服器實際檢視首頁桌面 1280px、手機 390px，登入頁桌面 1280px、手機 390/320px；320px 的首頁與登入頁 `documentElement.scrollWidth` 均為 320px，沒有水平溢出。未登入狀態無法目視檢查工作台內頁。
- `node_modules/.bin/tsc --noEmit` 通過；`node_modules/.bin/next build --webpack` 通過（43/43 頁）；`git diff --check` 通過。
- `npm run build` 預設 Turbopack 在目前環境因子程序綁定連接埠遭拒而失敗，改用官方 `--webpack` 建置模式驗證成功。`npm run lint` 的既有腳本仍是 `next lint`，Next 16 回報 `Invalid project directory .../lint`；本次沒有更改 lint 設定。
- 本機未設定 Google SSO，故未執行實際登入與人機驗證；登入控制元件已做程式檢查與窄螢幕版面檢查。

# 2026-09-27 v0.79.0 網站 UI 發佈

## Goal + acceptance criteria

- [x] 確認使用者指定版本 `v0.79.0`，核對 `main`、遠端與既有 tag。
- [x] 統一 Web、lockfile 與 Android 本地版本號，維持單一共用版本。
- [x] 驗證版本與網站建置、檢查提交內容。
- [x] 提交並推送至 GitHub `main`；推送 `v0.79.0` tag。
- [x] 建立繁體中文 GitHub Release，確認遠端 commit/tag/release 與相關 CI。

## Risk & rollback

- **Risk level:** medium（共用版本 tag 觸發 Android APK 與 Docker 發佈）。
- **Affected components:** Web UI、Android 版本資訊、GitHub main/tag/Release 與發佈 CI。
- **Rollback:** 若需復原 UI，以新 commit revert 本次變更並重新發版；已公開 tag 與 Release 不重寫。Android APK 與 Docker `latest` 若受影響，重新發佈修正版本。

## Working notes

- 發佈前 `main` 與 `origin/main` 同為 `ea78224`，最新 tag 是 `v0.78.0`；`v0.79.0` 尚未存在。
- 發佈前 `package.json`、`package-lock.json`、`mobile/pubspec.yaml` 版本分別為 `0.77.3`、`0.77.2`、`0.78.0+127`。
- `main` 推送及 tag 推送都觸發 Android CI；tag 也觸發 Docker image CI，須檢查兩次 Android 執行結果。
- `.DS_Store` 是既有未追蹤檔，不納入提交。

## Results

- `package.json`、`package-lock.json` 與 `mobile/pubspec.yaml` 已統一為 `0.79.0`；Android 本地 build number 為 `128`。
- `node_modules/.bin/tsc --noEmit` 與 `node_modules/.bin/next build --webpack` 通過（43/43 頁）；`git diff --check` 通過。
- Release commit `657766d9b713e4fefb5b38800e51e1123af94345` 已推送到 `main`；遠端 `v0.79.0` tag 指向同一 commit。
- 正式 GitHub Release：[v0.79.0｜網站介面更新](https://github.com/es94111/AI_Food_Diary/releases/tag/v0.79.0)；APK 不附在 GitHub Release，由 Android CI 發佈至既有下載位置。
- Application Build `36323003178`、Prisma Migration Smoke Test `36323003221`、CodeQL Advanced `36323003188` 與 Docker image `36323025903` 皆成功。
- Android APK 的 `main` 執行 `36323003295` 與 tag 執行 `36323025919` 均成功；兩次執行的 `Upload APK to S3` 步驟皆為 `success`，發佈版本化與 latest APK。

# 2026-10-05 照片改存 private bucket + signed URL（issue #166／feature-gap B3）

## Goal + acceptance criteria

- [x] 照片不再以 data URL 送往 AI（`/api/meals/analyze`、`/api/meals/analyze-nutrition-label` 改走短效 signed URL）。
- [x] 照片只能由本人透過短效 signed URL 取得；未登入／非本人／過期／竄改皆失敗。
- [x] 既有 data URL／既有（未加密）物件仍可正常顯示（雙讀路徑）。
- [x] 刪除流程與生命週期寫入 `docs/photo-lifecycle.md`，並與「帳號刪除與資料清除」issue 對齊範圍。
- [x] `npm run build`、`test:storage`、`test:mcp`、`test:nouriledger` 通過。

## Risk & rollback

- **Risk level:** high（照片存取邊界、AI 外送、隱私基線）。無 schema／資料庫 migration。
- **Affected components:** `src/lib/storage.ts`（新增簽章）、`src/lib/vision-images.ts`、`src/lib/image-links.ts`、
  新增 `src/app/api/images`（含 `/ai`）、`src/lib/ai.ts`（改收 `VisionImageInput[]`）、
  `src/app/api/meals/analyze*`、`src/app/api/saved-foods*`、`dashboard/page.tsx`、web 元件、測試、文件。
- **Rollback:** 還原 PR；或清空 `APP_PUBLIC_URL` 重啟即可讓 AI 路徑退回伺服器端解密（bucket 權限不需變更）。
- **隱私不變量:** bucket 維持私有、signed URL 短效（user 10 分／ai 5 分）、scope 參與簽章、
  失敗一律同一 404、不寫入日誌、回應 `private` 且快取不超過簽章效期（AI response `no-store`）。

## Working notes

- **關鍵限制:** 物件本體是 AES-256-GCM 信封，S3 presigned URL 只會給出密文 → signed URL 必須回指本服務解密串流
  （捨棄原本預想的 `@aws-sdk/s3-request-presigner` 直連）。
- **AI 無 cookie:** `/api/images/ai` 不能用 `requireUser`，改以 `ai` scope capability URL（5 分鐘）並對 key 限流。
- **無公開 origin 回退:** `APP_PUBLIC_URL` 未設時 AI 走伺服器端解密＋data URL（正式環境會印一次警告）。
- 舊版 data URL 資料列無法簽章，維持走已驗證的 per-meal／per-food 路由。

## Results

- `npm run build`：通過（`tsc --noEmit` 乾淨、`/api/images`、`/api/images/ai` 進入路由表）。
- `npm run test:storage`：18/18；`test:mcp`：36/36；`test:nouriledger`：8 通過、13 略過（未設 `FOOD_TEST_DATABASE_URL`）。
- PR review 修復：legacy signed-image thumbnail 正確選擇 `?`／`&`；`/api/images` 私有快取效期不超過 signed link；Sentry 關閉 URL query 自動收集，避免 capability 參數進 trace。
- `npx eslint` 無法執行：repo 沒有 ESLint 9+ 要求的 `eslint.config.*`（既有設定問題）；`npm run lint` 使用已移除的 `next lint`。`npm run build` 包含 TypeScript 檢查且通過。
- 未執行：實機／瀏覽器端到端（無 live MinIO＋APP_PUBLIC_URL 環境），已於 `docs/photo-lifecycle.md` 列出可手動驗證步驟。
