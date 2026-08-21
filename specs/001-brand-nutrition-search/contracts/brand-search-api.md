# API Contract: 廠牌食品營養標示搜尋

本功能涉及 1 個新端點與 2 個既有端點的擴充。所有端點皆為既有 Next.js Route Handler（`src/app/api/**/route.ts`），沿用既有的 `requireUser()` cookie session 驗證與 `NextResponse.json` 回應慣例。Web（`meal-capture-form.tsx`）與 Android（`mobile/lib`）皆呼叫同一組端點。

## 1. `POST /api/foods/brand-search`（新增）

依廠牌與品項名稱搜尋公開營養標示資訊，並由 AI 判斷整理成候選清單。**不寫入資料庫**，也不建立任何「我的食物」紀錄。

### Auth / Rate limit
- 需登入（`requireUser()`）。
- 套用既有 `enforceAiRateLimit(userId)`（AI 判斷部分的共用預算）。
- 另套用新增的搜尋專用限制（保護共用 Tavily 配額，見 research.md §5）。

### Request

```jsonc
{
  "brand": "光泉",      // 必填，1–80 字
  "itemName": "保久乳"   // 必填，1–120 字
}
```

兩欄缺一即回 `400`（zod 驗證錯誤，沿用既有錯誤回應格式）。

### Response — 200 OK（含候選，或候選為空陣列＝查無結果）

```jsonc
{
  "candidates": [
    {
      "name": "光泉全脂保久乳",
      "packageInfo": "每瓶 245ml",
      "calories": 150,
      "protein": 7.5,
      "fat": 8,
      "carbs": 11
    }
    // 最多 5 筆；缺漏欄位為 null，不得捏造
  ]
}
```

`candidates: []` 代表查無結果（FR-007）——這是正常的 200 回應，不是錯誤。前端據此顯示「查無結果」訊息＋「改用手動輸入／上傳照片」入口。

### Response — 錯誤情況

| 狀況 | Status | Body |
|---|---|---|
| 驗證失敗（欄位缺漏/過長） | 400 | `{ "error": "..." }` |
| 未登入 | 401 | （沿用 `requireUser()` 既有行為） |
| 速率限制 | 429 | `{ "error": "..." }`，含 `Retry-After` header |
| 搜尋服務未設定（`TAVILY_API_KEY` 缺漏） | 503 | `{ "error": "品牌搜尋功能尚未設定，請改用手動輸入或上傳營養標示。" }` |
| 搜尋逾時／來源服務無法連線／整體耗時超過強制上限（搜尋＋AI 判斷合計 >25 秒，見 research.md §5） | 502 | `{ "error": "搜尋逾時，請稍後再試。" }` |
| AI 判斷失敗（沿用既有 `aiErrorResponse` 慣例） | 502/500 | `{ "error": "..." }` |

以上所有錯誤情況皆不寫入任何資料（FR-011）。

## 2. `POST /api/saved-foods`（既有端點，擴充）

沿用既有建立流程與 409 重複偵測回應（`DUPLICATE_FOOD`），僅新增／調整下列欄位。

### Request 新增欄位

```jsonc
{
  // ...既有欄位（name/estimatedAmount/calories/protein/fat/carbs/barcode/isFavorite/imageDataUrl/allowDuplicate 等不變）
  "brand": "光泉",                 // 新增，選填；source = "BRAND_SEARCH" 時前端應帶入使用者輸入的廠牌
  "source": "BRAND_SEARCH"        // source 列舉新增此值（既有 MANUAL/NUTRITION_LABEL/BARCODE/MEAL_ITEM 不變）
}
```

### Response 新增欄位

成功建立、以及 409 重複回應中的 `food` / `exactBarcode.food` / `duplicates[].food` 物件，皆新增：

```jsonc
{
  // ...既有欄位
  "brand": "光泉" // 或 null（無廠牌資料）
}
```

### 409 重複回應新增 reason

`duplicates[].reason` 除既有的 `"barcode" | "name" | "similar"` 外，新增 `"brand"`（見 data-model.md §1 比對規則），語意與既有 `reason` 用法一致，前端沿用既有的重複提示 UI（`SavedFoodConflictPrompt`），不需新增分支。

## 3. `PATCH /api/saved-foods/:id`（既有端點，擴充）

同 `POST` 的 request/response 擴充：`brand` 為新增的選填欄位（partial schema），可更新既有紀錄的廠牌；省略則維持不變。

## 4. `GET /api/saved-foods`（既有端點，擴充）

回應中每筆食物新增 `brand: string | null` 欄位，供「我的食物」管理頁與新增食物流程的重複偵測 UI 使用。既有查詢參數（`barcode`、`archived`）與排序邏輯不變。
