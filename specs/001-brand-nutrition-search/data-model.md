# Phase 1 Data Model: 廠牌食品營養標示搜尋

## 1. SavedFood（既有實體，擴充）

「我的食物」既有 Prisma model（`prisma/schema.prisma`）。本功能新增一個欄位、新增一個 `source` 列舉值；其餘欄位與行為不變。

| 欄位 | 型別 | 異動 | 說明 |
|---|---|---|---|
| `encBrand` | `Json?` | **新增** | 廠牌名稱，比照 `encName`／`encEstimatedAmount` 以 `encryptJson` 欄位級加密；解密後對外呈現為 `brand: string \| null`。既有（本功能上線前建立）的舊紀錄此欄位為 `null`，視為「無廠牌資料」 |
| `source` | `String` | **列舉值擴充** | 新增 `"BRAND_SEARCH"`（既有值：`MANUAL`／`NUTRITION_LABEL`／`BARCODE`／`MEAL_ITEM` 不變）。UI 顯示文字為「品牌搜尋」 |
| 其餘欄位 | — | 不變 | `name`／`estimatedAmount`／`calories`／`protein`／`fat`／`carbs`／`barcode`／`archivedAt`／`isFavorite`／`useCount`／`lastUsedAt`／`imageStorageKey` 等沿用既有定義與加密方式 |

**驗證規則**：
- 透過本功能（`source = "BRAND_SEARCH"`）建立的紀錄：`brand` 為必填（1–80 字，前後空白裁剪）。
- 其他建立來源：`brand` 為選填（維持可為 `null`）。
- `brand` 與 `name` 一样不做欄位級唯一性約束；重複偵測在應用層進行（見下方「比對規則」）。

**狀態／生命週期**：不新增新的生命週期狀態，沿用既有 `archivedAt`（軟刪除／封存）語意。FR-012 的重複比對只針對 `archivedAt = null`（未封存）的既有紀錄。

**比對規則（FR-012，擴充 `src/lib/saved-food-matching.ts`）**：

```
SavedFoodMatchCandidate 新增: brand?: string | null

新增判定分支（獨立於既有的條碼／名稱／營養相似度分支，任一命中即視為 match）：
  input.brand 與 candidate.brand 皆非空
  且 normalizeFoodText(input.brand) === normalizeFoodText(candidate.brand)
  且（normalizeFoodText(input.name) === normalizeFoodText(candidate.name)
      或其中一方字串包含另一方）
  => { reason: "brand", score: 高（足以觸發 409 重複提示), archived: !!candidate.archivedAt }

candidate.brand 為 null／空字串的既有舊紀錄不參與此分支。
```

## 2. 食物搜尋查詢（新增，暫時性，僅存在於單次請求）

使用者觸發搜尋時的輸入，不落地儲存，僅作為 `POST /api/foods/brand-search` 的請求 body。

| 欄位 | 型別 | 必填 | 驗證 |
|---|---|---|---|
| `brand` | string | 是 | 1–80 字，trim 後不可為空 |
| `itemName` | string | 是 | 1–120 字，trim 後不可為空 |

兩欄皆為必填（spec 澄清：僅填其一不得觸發搜尋）。

## 3. 候選營養標示結果（新增，暫時性，僅存在於單次回應）

AI 依搜尋結果整理出的候選，不落地儲存；使用者於前端確認畫面編輯後才會轉換成「我的食物」的建立請求。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string | AI 判斷出的品項名稱 |
| `packageInfo` | string \| null | 可辨識的包裝規格或口味描述（如「245ml」「無糖口味」），用於在多筆候選中區分彼此（FR-004）；使用者於確認畫面選定後，此值作為 `estimatedAmount` 的預設值，可再編輯 |
| `calories` | number \| null | kcal；缺漏時為 `null`，不得由 AI 捏造（FR-008） |
| `protein` | number \| null | 公克；缺漏時為 `null` |
| `fat` | number \| null | 公克；缺漏時為 `null` |
| `carbs` | number \| null | 公克；缺漏時為 `null` |

**集合層級規則**：
- 一次回應最多 5 筆候選（FR-004）；AI 判斷出的相符候選超過 5 筆時，僅保留最相符的前 5 筆。
- 候選一筆都沒有時，視為「查無結果」（FR-007），前端顯示查無結果訊息並提供手動輸入／上傳照片入口，而非回傳錯誤狀態碼。

**與「我的食物」的轉換關係**：使用者從候選清單選定一筆後，前端把候選欄位映射到既有「我的食物」建立表單的欄位（`name`／`estimatedAmount`(=`packageInfo`)／`calories`／`protein`／`fat`／`carbs`），並強制要求四項營養數值皆非空才能送出（FR-005）；送出時另外帶上使用者輸入的 `brand`（來自「食物搜尋查詢」）與 `source: "BRAND_SEARCH"`，呼叫既有 `POST /api/saved-foods`。
