# 照片生命週期（private bucket + signed URL）

本文件說明餐點／常用食物照片的儲存方式、存取路徑、生命週期與刪除範圍，對應 issue
「照片改存 MinIO private bucket + signed URL」（feature-gap-analysis B3），並與
「帳號刪除與資料清除」對齊刪除範圍。加密遷移的分階段做法見
[`encryption-migration.md`](encryption-migration.md)。

## 1. 儲存基線

| 項目 | 設計 |
| --- | --- |
| Bucket | 私有（S3／MinIO），不設 public ACL／bucket policy。`S3_BUCKET`（預設 `food-diary-images`） |
| 物件路徑 | `meals/<userId>/<timestamp>-<random>.<ext>`（`src/lib/storage.ts` 的 `uploadImage`） |
| 靜態加密 | 物件本體為 AES-256-GCM 信封（`ENC1` magic）；金鑰由 `ENCRYPTION_KEY` 金鑰環管理 |
| 大小／型別 | 上限 6 MB；只接受 jpeg／png／webp／gif／avif，並驗證 magic number |
| 資料庫欄位 | `Meal.imageStorageKeys[]`（清單）、`Meal.imageStorageKey`（鏡射第一張，舊路徑）、`SavedFood.imageStorageKey` |

因為物件是加密信封，**無法直接開 S3 presigned URL**（那樣只會拿到密文）。因此所有讀取都
經過本服務解密後串流；signed URL 指的是本服務的短效簽章連結，而非 S3 直連。

## 2. 存取路徑

| 用途 | 端點 | 簽章 scope | 效期 | 驗證 |
| --- | --- | --- | --- | --- |
| Web／App 顯示 | `GET /api/images?k=&e=&s=` | `user` | 10 分鐘 | 簽章 + 登入 + `meals/<uid>/` 擁有者前綴 |
| AI 分析取圖 | `GET /api/images/ai?k=&e=&s=` | `ai` | 5 分鐘 | 簽章（capability URL，AI 供應商不帶 cookie） |
| 舊版 inline 照片 | `GET /api/meals/[id]/image`、`GET /api/saved-foods/[id]/image` | — | — | 登入 + 本人資料列 |
| 縮圖 | `/api/images?…&w=256` | `user` | 同上 | 同上（`w` 不在簽章內，只影響輸出尺寸） |

- 簽章為 `HMAC-SHA256(AUTH_SECRET, "image-signed-url:v1" | scope | exp | key)`，比對使用
  常數時間 `crypto.timingSafeEqual`。key 由既有 `AUTH_SECRET` 衍生，不新增環境變數。
- scope 參與簽章：`user` 連結不能當 `ai` 連結使用，反之亦然。
- 全部失敗（格式錯誤、簽章不符、過期、非本人、物件不存在）一律回同一個 `404`，避免探測 key。
- 回應採 `Cache-Control: private`，最大快取 60 秒，且動態不超過簽章剩餘效期；`ai` capability 回應為 `private, no-store`。Sentry 關閉 URL query 自動收集，避免簽章值進入 trace。
- 端點不寫入任何日誌（僅在 `IMAGE_UNREADABLE` 等失敗時回傳通用錯誤訊息），符合隱私基線。

### AI 不再收到 data URL

`POST /api/meals/analyze`、`POST /api/meals/analyze-nutrition-label` 會先把照片寫入 bucket，
再以 `resolveVisionImageInputs`（`src/lib/vision-images.ts`）產生 `ai` scope 短效 URL 交給
AI provider。**當 `APP_PUBLIC_URL` 未設定**時，無法提供對外可達的 URL，退回伺服器端解密
後以 data URL 傳送（並印出一次警告），以保有無公開 origin 部署的可用性。

### 既有資料相容

- 既有的 data URL 資料列：`isStorageKey()` 為 false，繼續走已驗證的 per-meal／per-food
  串流路由，並可正常顯示。
- 既有的未加密（舊）物件：`getDecryptedImage` 會偵測不到 `ENC1` 信封而原樣回傳。
- 不需 schema 變更；`imageStorageKeys`／`imageStorageKey` 語意不變。

## 3. 生命週期

| 事件 | 行為 |
| --- | --- |
| AI 預覽分析 | 照片先上傳，分析後於 `finally` 立即回收未被引用的 key（預覽不保存） |
| 儲存餐點 | 照片成為 `Meal.imageStorageKeys` 的一部分；引用同一 key 時不重複上傳 |
| 從常用食物挑選 | 餐點直接引用該食物的 key，不複製物件 |
| 刪除單張照片 | `DELETE /api/meals/[id]/image?i=`，移除後僅在**無其他引用**時刪除物件 |
| 刪除餐點 | `DELETE /api/meals/[id]`，逐 key 呼叫 `deleteImageIfUnreferenced` |
| 刪除／取代常用食物照片 | 同上，`deleteImageIfUnreferenced` |

引用計數由 `src/lib/image-refs.ts` 的 `deleteImageIfUnreferenced` 負責：物件只在
`SavedFood` 與 `Meal`（含 `imageStorageKeys`）都不再引用時才刪除。

## 4. 帳號刪除範圍與失敗處理

`DELETE /api/account` 僅允許已登入使用者刪除自己的帳號，並要求 JSON body 中的
`confirmation` **精確等於 `DELETE`**。設定頁要求使用者先輸入這段文字；沒有冷靜期，提交後即永久刪除。
刪除區會直接提供「下載我的資料」連結（`/api/me/data/export`），建議先下載需要保留的個人副本。
Web 成功回應後清除應用程式命名空間下的 PWA 本機草稿／狀態與應用程式快取，不影響其他網站的資料；
若支援的瀏覽器儲存清理失敗，設定頁會顯示警告、重試按鈕與手動清除網站資料的指引；瀏覽器不支援的儲存區視為無需清理。
Android 會清除安全儲存中的 session／Health Connect token、API／照片快取與桌面小工具資料；一般登出若本機清理失敗會顯示警告並仍返回登入頁，
帳號刪除成功後若裝置端清理失敗，也會在返回登入頁前顯示警告並提示以 Android 應用程式儲存空間設定手動清除。

同一個 PostgreSQL 交易會先遞增 `tokenVersion`、建立照片清理 outbox 工作，解除該使用者所有
`AiAuditEvent.userId`／`restoredByUserId` 關聯，最後刪除 `User`。資料列範圍包括：

- `User`／`UserProfile`、`Meal`／`MealItem`、`WaterLog`、`SavedFood`、`MealBundle`／`MealBundleItem`
- `DailySummary`、`WeeklySummary`、`DailyRecommendation`、`HealthConnection`、`HealthMetric`
- `McpOAuthAuthorizationCode`（未兌換的 OAuth 授權碼）

上列有 `User` 外鍵的資料由 schema 中的 `onDelete: Cascade` 清除；`AiAuditEvent` 是例外：保留不可變
事件與加密的 before／after state，只將使用者與還原者 ID 解除關聯。`AiAuditEvent.userId` 改為 nullable，
外鍵採 `ON DELETE SET NULL`；資料庫 trigger 仍拒絕一般更新、刪除與 truncate，只允許將這兩個身分欄位
由非空改為空。清除後稽核紀錄不再屬於任何使用者，也無法由已刪除帳號檢視或還原。

照片範圍是 `meals/<userId>/` prefix 底下的所有物件（包括 Meal、SavedFood、MealBundle 引用及未被資料列
引用的孤兒物件），不只目前 DB 欄位列出的 keys。DB 交易提交後，API 立即列出 prefix 並以 S3 批次刪除；
S3 與 PostgreSQL **不是同一個交易**。DB 交易若失敗，使用者、稽核紀錄與 outbox 一起回滾，完全不碰 S3。
DB 提交後若列舉／刪除照片失敗，帳號仍保持刪除、所有新請求因使用者不存在而失效，API 回 `202`，outbox
保留待處理工作；已成功刪除的部分物件不會還原，重試時只會刪除仍存在的物件。`DeleteObjects` 與再次列舉
prefix 是冪等的。

以部署環境的 DB 與 S3 設定重跑所有未完成工作：

```bash
npm run account:cleanup:photos
```

腳本只在 prefix 所有物件均成功刪除（或已不存在）後移除 outbox 工作；任何失敗會保留工作並以非零狀態結束，
可安全再次執行。工作只保留 `meals/<userId>/` prefix，不保留 email 或使用者資料；成功後即刪除該 prefix 記錄。

### 回滾與營運限制

- DB 交易提交前發生失敗：交易完整回滾，可修復原因後重試刪除。
- DB 交易提交後不可用程式回滾還原帳號；照片清理失敗只重試清理，不要從備份還原該帳號資料。
- 回滾應用程式版本不會復原已刪資料。此 migration 不可用簡單 down migration 回復：已保留的稽核事件會有
  `userId = NULL`，重新設為 NOT NULL／`ON DELETE RESTRICT` 前必須另行定義重新關聯或保留政策。
- 正常請求會嘗試即時清理；大量照片、儲存服務中斷或函式逾時時，outbox 仍可由上述腳本重試。已通過認證、
  且在刪除交易提交前開始的請求可能完成當前工作；提交後的新請求均無法再驗證此使用者。

## 5. 刪除與保留策略

- 目前**沒有自動過期／保留期限**：照片保留到使用者刪除餐點／食物或刪除帳號為止。
- 未引用的孤兒物件（例如上傳後流程中斷）目前不會自動清理；可用管理員資料匯出／清理腳本
  （`scripts/`）比對 `listKeys("meals/<uid>/")` 與資料庫引用後清除。
- 若要改為限時保留，需新增排程（worker）掃描孤兒物件，並將策略寫入本文件後再實作。

## 6. 設定與驗證

| 環境變數 | 用途 |
| --- | --- |
| `S3_ENDPOINT`／`S3_REGION`／`S3_ACCESS_KEY`／`S3_SECRET_KEY`／`S3_BUCKET` | 私有 bucket 連線 |
| `APP_PUBLIC_URL` | 對外可達的 origin，用來組 signed URL 交給 AI（正式環境建議必設） |
| `AUTH_SECRET` | signed URL HMAC 金鑰來源（已存在，不需新增） |

驗證：

```bash
npm run test:storage   # 簽章／scope／過期／擁有者／相容路徑
npm run build          # tsc + next build
```

手動驗證重點：

- 未登入直接開 `/api/images?…` → 401／404。
- 竄改 `k`／`e`／`s` 任一值 → 404。
- 用他人 key（`meals/<other>/...`）即使簽章正確 → 404。
- 過期（把 `e` 改成過去時間）→ 404。
- 既有 data URL 餐點仍可顯示（走 per-meal route）。

## 7. 回滾

- 程式回滾：還原本 PR 即回到以 data URL 送 AI 的行為；schema 與資料庫欄位未變，無需回滾遷移。
- 快速降級（不換版）：清空 `APP_PUBLIC_URL` 後重啟 app 容器，AI 路徑即退回伺服器端解密
  （signed URL 仍可供 Web／App 顯示使用）。
- Bucket 權限不需要任何變更（維持私有）。
