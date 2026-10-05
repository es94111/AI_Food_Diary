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
- 回應 `Cache-Control: private, no-store`／`max-age=60`，簽章連結不進共享快取。
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

## 4. 帳號刪除範圍（與「帳號刪除與資料清除」對齊）

帳號刪除時，照片的清除範圍為：

1. 該使用者 `Meal.imageStorageKey`、`Meal.imageStorageKeys[]`、`SavedFood.imageStorageKey`
   指向的所有 key（去重後）。
2. 逐一 `deleteImage`（不經引用計數，因為所有者的資料列都在同一次清除中移除）。
3. 部分失敗時可重跑：清除腳本再次列出 `meals/<userId>/` 底下的物件（`listKeys`）並刪除殘留，
   資料庫列已不存在時仍可安全重複執行。
4. 順序建議：先刪資料庫列（交易）→ 再刪物件；物件失敗不影響授權狀態（session 已由
   `tokenVersion` 遞增撤銷），殘留物件由 (3) 的清理路徑收斂。

> 帳號刪除本身尚未實作（見該 issue）；本節定義其照片清除的介面與可重跑策略。

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
