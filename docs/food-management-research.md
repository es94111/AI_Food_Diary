# 常用食物與自建食物管理競品調查

## 背景

目標功能：新增「常用食物」與「使用者自己新增的食物管理」功能。

本文件先調查市面飲食紀錄 App 的常見管理方式，聚焦以下場景：

- 常用食物
- 使用者自建食物
- 條碼食品
- 最近使用
- 收藏/我的食物
- 營養標示建立食物

## 調查對象

- MyFitnessPal
- Cronometer
- Lose It!
- YAZIO

主要參考公開支援文件與產品行為描述。部分細節為基於文件的產品設計推論。

## 市面共同模式

### 1. 食物管理通常分多個入口

成熟飲食紀錄 App 很少只提供一個「常用食物列表」。常見入口包含：

- 全部搜尋
- 最近使用
- 收藏/常用
- 我的食物
- 自建食物
- 食譜/餐組
- 條碼商品

這種分層能同時支援快速紀錄與資料管理。

### 2. 常用食物多半由使用行為累積

Lose It! 的 My Foods 是典型做法：使用者記錄過的食物或建立的 custom food，會進入自己的食物清單。

這降低使用者維護成本，避免要求使用者額外手動整理常用清單。

### 3. 自建食物是完整資料物件

Cronometer 的 Custom Food 不只是名稱，而是一個完整食物資料物件，通常包含：

- 名稱
- 品牌
- 分類
- 備註
- 條碼
- 份量/單位
- 營養標示資料
- 多語名稱
- 完整營養素

如果是多食材自製餐點，Cronometer 建議使用 Custom Recipe，而不是 Custom Food。

### 4. 條碼是自建食物的重要入口

Cronometer 明確把 barcode 當成 custom food 的可查找欄位。使用者輸入 UPC 後，下次掃描條碼即可快速加入日記。

這與 AI Food Diary 目前的方向一致：掃不到條碼時，上傳營養標示並綁定條碼，之後可快速掃描加入。

### 5. 收藏/常用與自建食物不是同一件事

Cronometer 有 Favorites tab，也有 Custom tab。

- 收藏/常用：使用者想快速找到。
- 自建食物：使用者擁有或可編輯的食物資料。

因此不應把「常用」等同於「自己新增」。一個由條碼命中的商品，也應該可以被收藏為常用。

### 6. 最近使用是高頻入口

飲食紀錄具有高度重複性。使用者常常反覆吃相同食物，所以「最近吃過」與「常用」比完整資料管理更常被使用。

### 7. 餐組/Meal 是另一個高頻功能

MyFitnessPal 的 remembered meals 可以把多個食物保存成一餐，例如「兩顆蛋 + 麥片 + 牛奶」。下次可以一次加入。

這與單一常用食物不同，但對實際飲食紀錄非常有價值。

### 8. 刪除需要區分資料與歷史紀錄

Cronometer 有值得參考的設計：

- Delete：移除食物，可能影響 diary entries。
- Retire：從 custom food 清單移除，但保留歷史紀錄。

AI Food Diary MVP 可以先做封存，而不是硬刪，避免歷史餐點資料失真。

## 競品功能對照

| App | 常用/收藏 | 自建食物 | 條碼 | 食譜/餐組 | 管理特色 |
| --- | --- | --- | --- | --- | --- |
| MyFitnessPal | My Meals / Foods / Recipes | 可新增資料庫沒有的食物 | 支援掃描 | Remembered Meals | 強調快速重複紀錄 |
| Cronometer | Favorites tab | Custom Foods tab | 自建食物可填 UPC，下次掃描 | Custom Recipe / Custom Meal | 重視資料品質、來源與完整營養素 |
| Lose It! | My Foods 自動累積 | Custom Foods | 支援食品資料庫與分享 | 有 recipes/meals 類概念 | 記錄過或自建會自動進 My Foods |
| YAZIO | Favorites | Created Foods | 可管理 public/private food，條碼相關 | Recipes | 食物可收藏、可建立、可編輯 |

## 對 AI Food Diary 的建議設計

建議不要只做「新增常用食物管理頁」，而是設計成一個完整但輕量的「我的食物」系統。

### MVP 功能範圍

#### 1. 我的食物列表

顯示使用者自己新增的食物與常用食物。

建議欄位：

- 名稱
- 份量
- 熱量
- 蛋白質
- 脂肪
- 碳水
- 條碼
- 最後使用時間
- 使用次數
- 是否收藏
- 是否封存

#### 2. 來源標籤

每筆食物應該記錄來源，方便使用者理解資料從哪裡來，也方便未來 debug。

建議來源：

- 手動新增
- 營養標示辨識
- 條碼綁定
- 從餐點保存

#### 3. 收藏/常用星號

讓使用者把任意食物標成常用。

常用不應只限於自己新增的食物。一個常被使用的條碼商品，也應該可以收藏。

#### 4. 最近使用排序

列表預設排序建議：

- 收藏優先
- 最近使用
- 使用次數

#### 5. 新增、編輯、封存

MVP 建議支援：

- 新增食物
- 編輯營養資料
- 綁定/修改條碼
- 收藏/取消收藏
- 封存

不建議一開始做硬刪，避免歷史餐點資料失真。

#### 6. 從記錄流程快速保存

在手動食物列或 AI 辨識確認視窗中提供：

- 存到我的食物
- 加入常用

#### 7. 條碼掃不到時補資料

建議完整化目前流程：

1. 掃描條碼失敗。
2. 顯示「尚未收錄」。
3. 上傳營養標示。
4. AI 辨識營養資料。
5. 使用者確認。
6. 儲存成我的食物並綁定條碼。
7. 下次掃描同條碼即可直接加入。

## 不建議 MVP 做的功能

以下功能屬於成熟產品階段，建議暫緩：

- 公開食物資料庫
- 分享給其他用戶
- 審核機制
- 完整微量營養素
- 多語名稱
- CSV/JSON 匯出
- 複雜食譜計算

## 推薦資訊架構

新增入口：`我的食物`

可以放在 Dashboard 或 Settings。

頁面 tabs：

- 常用
- 我的新增
- 有條碼
- 最近使用

每筆 food card 顯示：

- 名稱
- 份量
- 熱量、P/F/C
- 條碼，如果有
- 使用次數
- 上次使用日期

操作：

- 加入本餐
- 編輯
- 收藏/取消收藏
- 封存

新增入口：

- 手動新增
- 掃描條碼
- 上傳營養標示

## 資料模型建議

目前專案已有 `SavedFood` 概念，建議擴充現有模型，而不是另建一套。

建議新增欄位：

```ts
source: "MANUAL" | "NUTRITION_LABEL" | "BARCODE" | "MEAL_ITEM"
isFavorite: boolean
useCount: number
lastUsedAt: Date | null
archivedAt: Date | null
brand: string | null
notes: string | null
```

可選欄位：

```ts
servingSize: string
category: string | null
```

MVP 可先沿用現有 `estimatedAmount` 表達份量。

## AI Food Diary 的差異化方向

AI Food Diary 不需要照抄大型食物資料庫。更適合強化以下優勢：

1. 使用者拍營養標示，自動建立我的食物。
2. 條碼掃不到時，拍標示後下次即可掃。
3. AI 辨識餐點後，可以一鍵把修正後的品項存成常用。
4. 常吃食物自動浮上來，使用者越用越省力。

## 建議下一步

MVP 實作狀態：

1. 已擴充 `SavedFood`：收藏、使用次數、最後使用、封存、來源。
2. 已將 Web 的 `saved-foods-manager.tsx` 改成完整「我的食物管理」。
3. 已將 Mobile 的 `saved_foods_manager.dart` 同步支援分類、編輯、收藏、封存。
4. 已在加入本餐、條碼命中、從常用加入時更新 `useCount` / `lastUsedAt`。
5. 已讓上傳營養標示建立的食物自動進入使用者的食物清單，並可透過條碼查到。

## 已落地檔案

- `prisma/schema.prisma`
- `prisma/migrations/20260610010000_saved_food_management/migration.sql`
- `src/app/api/saved-foods/route.ts`
- `src/app/api/saved-foods/[id]/route.ts`
- `src/components/saved-foods-manager.tsx`
- `src/components/meal-capture-form.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/lib/validators.ts`
- `src/lib/b2-crypto.ts`
- `mobile/lib/models/models.dart`
- `mobile/lib/services/saved_food_service.dart`
- `mobile/lib/widgets/saved_foods_manager.dart`
- `mobile/lib/widgets/meal_capture_form.dart`

## 實作細節

### SavedFood 欄位

已加入：

```ts
source: "MANUAL" | "NUTRITION_LABEL" | "BARCODE" | "MEAL_ITEM"
isFavorite: boolean
useCount: number
lastUsedAt: Date | null
archivedAt: Date | null
```

本次 MVP 尚未加入：

```ts
brand: string | null
notes: string | null
category: string | null
```

原因：目前 UI 與紀錄流程的核心需求是「快速重複使用、條碼綁定、常用管理」。品牌、備註、分類可以等使用者資料量變大後再補，避免第一版管理表單過重。

### Web

`src/components/saved-foods-manager.tsx` 已改為「我的食物管理」，支援：

- 常用
- 我的新增
- 有條碼
- 最近使用
- 新增食物
- 編輯食物
- 收藏/取消收藏
- 封存
- 來源標籤
- 使用次數與最後使用日期

### Mobile

`mobile/lib/widgets/saved_foods_manager.dart` 已同步支援：

- 常用
- 我的新增
- 有條碼
- 最近使用
- 新增食物
- 編輯食物
- 收藏/取消收藏
- 封存
- 來源標籤
- 使用次數與最後使用日期

### 使用次數更新

以下行為會更新 `useCount` / `lastUsedAt`：

- Web 條碼查詢命中。
- Mobile 條碼查詢命中。
- Web 從常用食物加入本餐。
- Mobile 從常用食物加入本餐。

### 營養標示建立食物

上傳營養標示後建立的食物會：

- 設定 `source = "NUTRITION_LABEL"`。
- 設定 `isFavorite = true`。
- 若當前有待綁定條碼，會綁定該條碼。
- 之後可透過條碼查詢命中。

### 從餐點保存食物

從 AI 辨識或手動食物列保存的食物會：

- 設定 `source = "MEAL_ITEM"`。
- 設定 `isFavorite = true`。

### 封存策略

刪除操作已改為封存：

- API `DELETE /api/saved-foods/[id]` 會設定 `archivedAt`。
- 一般列表與條碼查詢只查 `archivedAt = null` 的資料。
- 這樣可以保留歷史餐點資料，不會因刪除常用食物而影響過去紀錄。

## 驗證結果

已執行：

```bash
npm run prisma:generate
npm run build
flutter analyze
flutter test
```

結果：

- `npm run build` 通過。
- `flutter test` 通過。
- `flutter analyze` 無本次新增錯誤，僅剩既有 info：`auth_service.dart` null-aware lint 與 `meal_list.dart` underscore lint。
