# AI Food Diary · 功能清單與測試指南

> 本文列出 **WEB**（Next.js App Router）與 **APP**（Flutter Android）的所有功能，並說明如何用隨附的測試檔案快速驗證功能是否正常。
>
> Web 與 App 共用同一個後端（Prisma + PostgreSQL）、同一個版本號；認證皆走 `food_diary_session` HttpOnly Cookie（JWT，HS256，30 天，`tokenVersion` 撤銷）。

---

## 📑 目錄

- [WEB 功能](#web-功能)
  - [1. 認證與使用者](#1-認證與使用者)
  - [2. 餐點 Meals](#2-餐點-meals)
  - [3. 常用食物 Saved Foods](#3-常用食物-saved-foods)
  - [4. 喝水 Water](#4-喝水-water)
  - [5. 健康 Health Connect](#5-健康-health-connect)
  - [6. 昨日總結與下一餐建議](#6-昨日總結與下一餐建議)
  - [7. 管理 / App 後設資料](#7-管理--app-後設資料)
  - [Web 頁面](#web-頁面)
  - [背景工作 Worker](#背景工作-worker)
- [APP 功能](#app-功能)
  - [畫面 Screens](#畫面-screens)
  - [元件 Widgets](#元件-widgets)
  - [服務與 API 對應](#服務與-api-對應)
  - [資料模型 Models](#資料模型-models)
- [如何執行測試](#如何執行測試)
  - [WEB HTTP 煙霧測試](#web-http-煙霧測試)
  - [Flutter 單元／Widget 測試](#flutter-單元widget-測試)

---

## WEB 功能

所有 API 路由位於 `src/app/api/`，路徑前綴 `/api`。除非標註「Public」或「Admin」，皆需登入（`requireUser`，缺 Cookie 回 401）。會呼叫 AI 的路由另套用「每位使用者 AI 速率限制」（`enforceAiRateLimit`）。

### 1. 認證與使用者

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | 舊版帳密登入（已停用） | Public | 永遠回 410；不解析或驗證密碼。請改用 Google SSO。 |
| POST | `/api/auth/register` | 舊版帳密註冊（已停用） | Public | 永遠回 410；不建立帳號。請改用 Google SSO。 |
| POST | `/api/auth/logout` | 本機登出 | Authed | 僅清本機 Cookie，不撤銷 `tokenVersion`。回 `{ ok:true }` |
| POST | `/api/auth/google` | Google SSO 登入／註冊 | Public | 先以 Turnstile action=`login` 驗證人機 token（success、action、hostname），再驗證 Google ID token；以 `googleId` 找回帳號，首次使用自動建立帳號；不以 Email 自動綁定既有帳號 |
| POST | `/api/auth/google/link` | 綁定 Google SSO | Authed | 供仍有 session 的舊帳號遷移；409 若該 Google 帳號屬於他人 |
| GET | `/api/me` | 取得目前使用者＋設定檔 | Authed | 敏感欄位（性別／生日／身高／體重）已加密，回傳明文 |
| PATCH | `/api/me` | 更新設定檔 | Authed | `gender?, birthDate?, heightCm?(80-250), weightKg?(20-350), activityLevel?, goal?, calorieTarget?(800-6000), waterGoalMl?, preferences?[], allergies?[]` |
| GET | `/api/me/ai-settings` | 取得 AI 設定 | Authed | API 金鑰永不回傳，僅回 `hasKey` 布林 |
| PATCH | `/api/me/ai-settings` | 更新 AI 設定 | Authed | `provider(openai\|gemini\|compatible), apiKey?, baseUrl?, visionModel?, textModel?`；compatible 需 baseUrl＋visionModel；換 provider/baseUrl 需重送金鑰 |
| POST | `/api/me/ai-settings/models` | 即時拉取可用模型 | Authed | 走 OpenAI 相容 `/models`，可回退使用已存金鑰 |
| POST | `/api/me/timezone` | 回報裝置時區 | Authed | `{ timezone }`（IANA），獨立寫入避免覆蓋其他欄位 |

### 2. 餐點 Meals

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| GET | `/api/meals` | 列出某日餐點 | Authed | `?date=YYYY-MM-DD`，時區取自 `afd_tz` cookie／`tz` query／設定檔 |
| POST | `/api/meals` | 儲存確認的餐點 | Authed | 上傳照片到 S3、計算總計、加密 notes/items。`{ mealType, imageDataUrls?\|imageDataUrl?, description?, manualItems?[], savedFoodImageIds?[], eatenAt? }` |
| POST | `/api/meals/analyze` | AI 圖片分析（預覽，不儲存） | Authed + AI 限流 | `precise=true` 跑中位數穩定估算。`{ mealType, imageDataUrls\|imageDataUrl, precise? }` |
| POST | `/api/meals/analyze-description` | AI 文字描述分析（預覽） | Authed + AI 限流 | `{ mealType, description(2-1200) }` |
| POST | `/api/meals/analyze-manual` | AI 對手動項目評分（預覽） | Authed + AI 限流 | `{ mealType, manualItems[] }` |
| POST | `/api/meals/analyze-nutrition-label` | AI 營養標示 OCR（預覽） | Authed + AI 限流 | `{ imageDataUrls\|imageDataUrl }`（1-5 張） |
| POST | `/api/meals/reestimate` | 重新估算已編輯項目（預覽） | Authed + AI 限流 | `{ manualItems[{name,estimatedAmount}] }` |
| GET | `/api/meals/[id]` | 取得單一餐點 | Authed | 404 若非本人 |
| PATCH | `/api/meals/[id]` | 取代餐點項目 | Authed | 交易內刪舊項目重算總計。`{ mealType, items[] }` |
| DELETE | `/api/meals/[id]` | 刪除餐點 | Authed | 一併移除未再被引用的照片 |
| GET | `/api/meals/[id]/image` | 串流餐點照片 | Authed | `?i=<index>`，`Cache-Control: private, max-age=60` |
| POST | `/api/meals/[id]/image` | 附加照片 | Authed | `{ imageDataUrls[] }`，最多 5 張 |
| DELETE | `/api/meals/[id]/image` | 刪除單張照片 | Authed | `?i=<index>` |

### 3. 常用食物 Saved Foods

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| GET | `/api/saved-foods` | 列出食物／條碼查詢 | Authed | `?archived=true` 列已封存；`?barcode=` 單筆查詢。排序：收藏→最近使用→使用次數→更新 |
| POST | `/api/saved-foods` | 建立食物 | Authed | 條碼硬性唯一＋軟性相似比對（`allowDuplicate` 可略過）。409 `DUPLICATE_FOOD` |
| PATCH | `/api/saved-foods/batch` | 批次封存 | Authed | `{ ids[](1-100) }` → `{ archivedCount }` |
| PATCH | `/api/saved-foods/[id]` | 部分更新 | Authed | `source` 不可改。409 條碼重複 |
| POST | `/api/saved-foods/[id]` | 標記使用 | Authed | 遞增 `useCount`、設 `lastUsedAt` |
| DELETE | `/api/saved-foods/[id]` | 軟封存 | Authed | 設 `archivedAt` |
| GET | `/api/saved-foods/[id]/image` | 串流食物照片 | Authed | 404 若無 |

### 4. 喝水 Water

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| GET | `/api/water` | 列出某日喝水紀錄 | Authed | `?date=`，回 `{ logs[], totalMl }` |
| POST | `/api/water` | 新增喝水紀錄 | Authed | `{ amountMl(1-5000), drankAt? }` |
| DELETE | `/api/water/[id]` | 刪除喝水紀錄 | Authed | 404 若非本人 |

### 5. 健康 Health Connect

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| GET | `/api/health/connections` | 列出同步裝置 | Authed | 回 `{ connections[] }` |
| POST | `/api/health/connections` | 建立同步裝置 | Authed | 產生一次性 Bearer token（回傳一次，後端存雜湊） |
| DELETE | `/api/health/connections/[id]` | 撤銷同步裝置 | Authed | 設 `revokedAt` |
| GET | `/api/health/sync` | 同步狀態 | Authed **或** Bearer | 各型別最新值、14 點體重折線、最近 50 筆量測（皆解密） |
| POST | `/api/health/sync` | 上傳量測 | Authed **或** Bearer | `{ source?, metrics[1-500]{ type, value≥0, unit≤32, measuredAt(ISO), raw? } }`，依 user+source+type+measuredAt upsert |
| GET | `/api/health/history` | 時間序列 | Authed | `?types=STEPS,WEIGHT,…`，`?limit=7-120`（預設 30） |

### 6. 昨日總結與下一餐建議

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| GET | `/api/daily-summary` | 預覽已存總結 | Authed | `?date=`、`?generate=1` 才花 AI 配額（僅允許過去日期） |
| GET | `/api/recommendations/next-meal` | 預覽／產生下一餐建議 | Authed | `?peek=1` 只讀已存；否則花 AI 產生並儲存（用當日總計、同步體重身高、TDEE） |

### 7. 管理 / App 後設資料

| Method | Path | 功能 | 認證 | 說明 |
| --- | --- | --- | --- | --- |
| GET/PATCH | `/api/admin/settings` | 舊版註冊設定（已停用） | Public | 永遠回 410；SSO 註冊不受舊設定切換。 |
| GET | `/api/admin/data/export` | 匯出全庫資料（解密） | **Admin** | 下載全部使用者明文 JSON（含 AI 金鑰明文）；不含圖片、密碼雜湊、健康連線權杖。`no-store` 附件下載，限流 3 次／10 分。跨站導覽回 403 |
| POST | `/api/admin/data/import` | 匯入資料（重新加密） | **Admin** | multipart `file`+`mode`（skip-existing 預設／overwrite 需 `confirm=true`）；以現行金鑰重加密寫回，逐表交易、upsert 不刪資料；部分失敗回 207 ＋逐表報告。限流 2 次／小時，檔案上限 50 MB |
| GET | `/api/app/download` | 串流最新 APK | **Public** | 從 S3 `downloads/` 取，無檔則 404 |
| GET | `/api/app/version` | 版本／更新資訊 | **Public** | 回 `{ webVersion, latestVersion, apkUrl, releaseNotes, googleClientId, turnstileSiteKey }`；Turnstile site key 為公開值 |

### Web 頁面

| 頁面 | 路徑 | 功能 |
| --- | --- | --- |
| 首頁 | `/` | 行銷登入頁；**已登入自動轉到 `/dashboard`**；hero 文案＋預覽卡，按鈕連到 `/login` 使用 Google SSO |
| 登入／註冊 | `/login` | **已登入自動轉到 `/dashboard`**；Google SSO 前先完成 Turnstile 人機驗證。首次成功登入自動建立帳號 |
| 舊註冊網址 | `/register` | 導向 `/login`；不再提供帳密註冊表單 |
| 管理 | `/dashboard/admin` | 僅管理員可見（側邊欄多出「管理」項；非管理員被導回儀表板）。`AdminDataForm`：匯出下載、匯入上傳（模式選擇＋備份確認勾選框）與逐表報告 |
| 儀表板殼 | `/dashboard` | 認證守門（未登入轉 `/login`）；`TimezoneReporter`、品牌 header、`DashboardNav`（飲食／健康／食物／設定［／管理，admin]） |
| 飲食 | `/dashboard` | 日／週切換；熱量目標卡（TDEE，Health Connect 體重身高覆蓋設定檔）＋巨量環；Health Connect 有 `TOTAL_CALORIES` 時顯示淨熱量卡；`WaterCard`；`MealCaptureForm`（照片／描述／手動／營養標示／條碼／下一餐建議）；`MealList`；週檢視；`DailySummaryPopup`；`AiInfoCard` |
| 食物 | `/dashboard/foods` | 「我的食物」`SavedFoodsManager` |
| 健康 | `/dashboard/health` | Health Connect 同步儀表板；`ActivityHero`；分組 `HealthGroupCard`（活動／睡眠／身體組成）；`HealthHistoryProvider`（點擊鑽取歷史）；BMR/TDEE 代謝卡（Mifflin-St Jeor） |
| 設定 | `/dashboard/settings` | `ProfileMetabolismForm`、`AiSettingsForm`、`GoogleLinkPanel`（舊帳號綁定）、版本卡（APK 下載 `/api/app/download`）、`LogoutButton` |

### 背景工作 Worker

`src/worker.ts` 為 BullMQ worker（Redis `REDIS_URL`），註冊**每小時**重複任務 `precompute-daily-summaries`（cron `5 * * * *`，重啟時冪等重建）。對每位**本地時間落在凌晨 1 點**的使用者產生並儲存昨日 AI 總結（讓 Web／App 首次開啟直接讀取，不跑即時 AI）。跳過無 AI 金鑰／當日無餐點的使用者。

---

## APP 功能

Flutter（Android）App，路徑 `mobile/`。Base URL `https://aifood.shao.one`（`services/api_client.dart:19`）。無具名路由表，靠 `MaterialPageRoute` + `RouteSettings(name:)`。流程：`SplashScreen` → 檢查 session → 已登入 `DashboardScreen`，否則 `LoginScreen`。

### 畫面 Screens

| 畫面 | 檔案 | 功能／使用者操作 |
| --- | --- | --- |
| Splash | `splash_screen.dart` | 品牌動畫閃屏（三色巨量環旋轉、餐廳 logo、標題＋標語）；背景啟動 `BackgroundAnalysis`/`MealAnalysisController`/`UpdateService`；檢查 session 後導向 |
| 登入／註冊 | `login_screen.dart` | 僅顯示 Google SSO；首次 Google 登入自動建立帳號；成功轉 `/dashboard` |
| 儀表板 | `dashboard_screen.dart` | `Scaffold` + `NavigationBar` 三分頁（飲食／健康／設定），背景分析時 AppBar 下方顯示進度條。**飲食**：日期切換（每日/每週、不可選未來）、熱量卡（含巨量與淨熱量）、`WaterCard`、`MealCaptureForm`、`MealList`、`_DailySummaryCard`；**健康**：`HealthSyncCard`、BMR/TDEE 卡；**設定**：帳號卡、身體資料卡、`AiSettingsCard`、我的食物管理、Google 連結、`UpdateCard`、管理員面板、登出。接 home widget 快速拍攝 |
| 食物管理 | `saved_foods_screen.dart` | `Scaffold` + `SavedFoodsManager()` |

### 元件 Widgets

| 元件 | 檔案 | 用途 |
| --- | --- | --- |
| `AiSettingsCard` | `ai_settings_form.dart` | 自帶 AI 金鑰（OpenAI/Gemini/相容）；provider 下拉、遮蔽金鑰欄、Base URL、模型欄、`載入模型清單`、`儲存 AI 設定` |
| `showDailySummaryPopup` | `daily_summary_popup.dart` | 昨日總結彈窗：kcal 行、`MarkdownText`、amber 建議框、關閉／`知道了`；不觸發 AI |
| `HealthSyncCard` | `health_sync_card.dart` | Health Connect 同步卡：同步狀態、分類指標圖（活動/身體組成/生命徵象/睡眠/營養）、點指標看趨勢、同步按鈕、同步紀錄 |
| `MarkdownText` | `markdown_text.dart` | 無依賴 Markdown 渲染：`#/##/###`、`-`/`*`、數字清單、`**粗**`/`*斜*/`` `code` `` |
| `MealCaptureForm` | `meal_capture_form.dart` | 餐點輸入：照片／描述／手動三模式、餐別下拉（自動取最近）、精準模式、條碼掃描、營養標示 OCR、儲存食物流程、下一餐建議 |
| `MealList`/`_MealCard` | `meal_list.dart` | 餐點卡片：餐別、時間、總 kcal、照片、項目評分、巨量條、`編輯`／`刪除`／補上傳照片 |
| `ProfileFormSheet` | `profile_form.dart` | 底部表單：性別、生日、身高、體重、活動量、目標；即時算 BMR/TDEE/熱量目標；`儲存身體資料` |
| `SavedFoodEditor` | `saved_food_editor.dart` | 建立／編輯食物：名稱、條碼、份量、巨量、`source` 唯讀鎖、收藏、圖片；處理 `DuplicateFoodException` 衝突（使用/更新/還原/另存） |
| `SavedFoodsManager` | `saved_foods_manager.dart` | 食物管理：分頁（常用/全部/有條碼/最近/未使用/可能重複/資料不完整/已封存）＋排序＋搜尋＋批次封存＋收藏＋編輯＋封存／還原 |
| `UpdateCard` | `update_card.dart` | App 自更新：版本顯示、`promptIfAvailable`、安裝未知應用權限、`UpdateService.start(apkUrl)`、下載進度對話框 |
| `WaterCard` | `water_card.dart` | 喝水卡：總量/目標＋進度條、預設 100/500/800 ml＋自訂、每筆刪除、內嵌目標編輯 |

### 服務與 API 對應

| 服務 | Method | Endpoint | 用途 |
| --- | --- | --- | --- |
| AuthService | POST | `/api/auth/google` | Google SSO 登入／首次使用時註冊 |
| AuthService | POST | `/api/auth/google/link` | 舊帳號綁定 Google SSO |
| AuthService | POST | `/api/auth/logout` | 登出 |
| AuthService | GET | `/api/me` | 取得使用者（快取） |
| AuthService | PATCH | `/api/me` | 更新設定檔 |
| MealService | GET | `/api/meals?date=&tzOffset=` | 某日餐點（快取） |
| MealService | POST | `/api/meals/analyze` | AI 圖片分析 |
| MealService | POST | `/api/meals/analyze-description` | AI 文字分析 |
| MealService | POST | `/api/meals/analyze-manual` | AI 手動項目評分 |
| MealService | POST | `/api/meals/reestimate` | 重新估算 |
| MealService | POST | `/api/meals/analyze-nutrition-label` | AI 營養標示 OCR |
| MealService | POST | `/api/meals` | 儲存餐點 |
| MealService | PATCH/DELETE | `/api/meals/$id` | 更新／刪除餐點 |
| MealService | POST/DELETE | `/api/meals/$id/image?i=` | 加／刪照片 |
| MealService | GET | `/api/meals/$id/image?i=` | 圖片 URL（Cookie 鑑權） |
| MealService | GET | `/api/daily-summary?date=&generate=1?` | 昨日總結（預覽／產生） |
| MealService | GET | `/api/recommendations/next-meal?peek=1?` | 下一餐建議（預覽／產生） |
| WaterService | GET | `/api/water?date=&tzOffset=` | 某日喝水紀錄（快取） |
| WaterService | POST | `/api/water` | 新增喝水 |
| WaterService | DELETE | `/api/water/$id` | 刪除喝水 |
| SavedFoodService | GET | `/api/saved-foods` | 列出／條碼查詢 |
| SavedFoodService | GET | `/api/saved-foods/$id/image` | 取食物照片 |
| SavedFoodService | POST | `/api/saved-foods` | 建立食物 |
| SavedFoodService | PATCH | `/api/saved-foods/$id` | 更新／還原 |
| SavedFoodService | DELETE | `/api/saved-foods/$id` | 封存 |
| SavedFoodService | PATCH | `/api/saved-foods/batch` | 批次封存（每批 100） |
| SavedFoodService | POST | `/api/saved-foods/$id` | 標記使用 |
| HealthService | POST | `/api/health/connections` | 註冊同步裝置→取 token |
| HealthService | POST | `/api/health/sync` | 上傳量測（Bearer，每批 ≤500） |
| HealthService | GET | `/api/health/sync` | 同步狀態（快取） |
| HealthService | GET | `/api/health/history?types=&limit=` | 歷史序列 |
| HealthService | GET/DELETE | `/api/health/connections` (`/$id`) | 列出／撤銷 |
| AiSettingsService | GET/PATCH | `/api/me/ai-settings` | 取／存 AI 設定 |
| AiSettingsService | POST | `/api/me/ai-settings/models` | 列出模型 |
| UpdateService | GET | `/api/app/version` | 版本／APK／發布說明 |
| UpdateService | GET | `/api/app/download…` | 前景下載 APK |
| GoogleAuth | GET | `/api/app/version` | 執行期解析 `googleClientId` |

### 資料模型 Models

`models.dart`（含 `part 'saved_food.dart'`）定義：`UserProfile`、`WaterLog`、`AppUser`、`MealItem`、`Meal`、`FoodAnalysisItem`、`DailySummary`、`SleepSegment`、`HealthMetricValue`、`HealthHistoryPoint`、`HealthHistorySeries`、`HealthConnection`、`HealthSyncStatus`、`Totals`、`SavedFood`。多數含 `fromJson`；`MealItem` 另有 `toPayload`。

---

## 如何執行測試

### WEB HTTP 煙霧測試

腳本：**`scripts/smoke-test-web.ps1`**。對本機 dev server（預設 `http://localhost:3000`）逐一打每個 API，回報 PASS／FAIL／SKIP。

**先決條件**：本機已 `npm run dev`（且 `.env` 至少有 `ENCRYPTION_KEY`、`AUTH_SECRET`；AI 測試另需 `OPENAI_API_KEY`）。

```powershell
# 不帶 token：驗證公開端點與帳密／舊註冊端點已回 410
./scripts/smoke-test-web.ps1

# 帶短效 Google ID token：建立 SSO session 後測受保護端點
./scripts/smoke-test-web.ps1 -BaseUrl http://localhost:3000 `
  -GoogleIdToken '<short-lived token>'

# 連 AI 端點也測（會花 OpenAI 配額）
./scripts/smoke-test-web.ps1 -GoogleIdToken '<short-lived token>' -IncludeAi
```

**測試帳號流程**：腳本不接受或儲存 Email／密碼；只有傳入有效的 `-GoogleIdToken` 才會透過 Google SSO 建立 session。測試 token 請使用短效值，勿提交至 shell history 或日誌。

**分組**：公開端點 → 認證政策與 Google SSO → 設定檔 → 餐點 → 喝水 → 常用食物 → 健康 → 昨日總結／下一餐建議（peek，不花 AI）→ 舊管理設定停用檢查 → AI（僅 `-IncludeAi`，未設金鑰會回 SKIP）。

**清理**：餐點／喝水／健康連線測試會建立後刪除；常用食物會建立後封存（留為封存項）。

### Flutter 單元／Widget 測試

新增測試檔（`mobile/test/`）：

| 檔案 | 涵蓋 |
| --- | --- |
| `models_test.dart` | 所有 model 的 `fromJson`／`toPayload` 來回轉換（抓 API 契約漂移） |
| `metabolism_test.dart` | BMR/TDEE/熱量目標/巨量目標運算（Mifflin-St Jeor；與 web `lib/metabolism.ts` 對齊） |
| `markdown_text_test.dart` | `MarkdownText` 標題／清單／粗斜體／code 渲染 |
| `meal_list_test.dart` | `MealList` 空狀態與餐點卡片呈現（純呈現，不打網路） |

既有測試（保留）：`widget_test.dart`（開機閃屏）、`saved_food_editor_test.dart`（source 唯讀鎖）、`saved_food_list_logic_test.dart`（食物列表邏輯）。

**執行**（於 `mobile/` 目錄）：

```bash
flutter test                    # 跑全部測試
flutter test test/models_test.dart          # 只跑 models
flutter test test/metabolism_test.dart      # 只跑 metabolism
flutter test test/markdown_text_test.dart   # 只跑 markdown
flutter test test/meal_list_test.dart       # 只跑 meal list
```

> 這些測試皆為**純邏輯／純呈現**，不需後端、不需模擬器，`flutter test` 即可在秒內完成，適合快速確認 App 端是否壞掉。需要打真實後端的端對端驗證，請用上面的 WEB HTTP 煙霧測試（後端 API 同時被 Web 與 App 使用）。
