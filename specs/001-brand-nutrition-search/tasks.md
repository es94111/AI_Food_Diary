---

description: "Task list for 廠牌食品營養標示搜尋"
---

# Tasks: 廠牌食品營養標示搜尋

**Input**: Design documents from `/specs/001-brand-nutrition-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/brand-search-api.md, quickstart.md

**Tests**: 專案未設置自動化測試框架（見 plan.md Testing）。完成證據為 `npm run lint`／`tsc --noEmit`（或 `npm run build`）＋ quickstart.md 手動驗證，因此本清單不包含自動化測試任務。

**Organization**: 任務依 spec.md 的 User Story（P1/P2/P3）分組，Foundational 階段完成後每個 Story 皆可獨立實作與驗證。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行執行（不同檔案、彼此無相依）
- **[Story]**: 對應 spec.md 的 US1／US2／US3
- 每項任務皆含明確檔案路徑

## Path Conventions

沿用 plan.md 的 Project Structure：Next.js 全端專案（`prisma/`、`src/lib/`、`src/app/api/`、`src/components/`）＋ 既有 Flutter Android 專案（`mobile/lib/`）。

---

## Phase 1: Setup

**Purpose**: 新增本功能所需的環境變數文件

- [X] T001 在 `.env.example` 新增 `TAVILY_API_KEY`（Tavily Search API 金鑰，見 research.md §1）與 `WEB_SEARCH_TIMEOUT_MS`（預設 10000，見 research.md §5）的說明與範例

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 資料模型、加解密、驗證、比對、速率限制、搜尋／AI 判斷共用邏輯，以及既有「我的食物」端點的欄位擴充——三個 User Story 皆建立於此之上

**⚠️ CRITICAL**: 此階段完成前不得開始任何 User Story 的實作

- [X] T002 在 `prisma/schema.prisma` 的 `SavedFood` model 新增 `encBrand Json?` 欄位（比照 `encName`／`encEstimatedAmount`，見 data-model.md §1）
- [X] T003 執行 `npx prisma migrate dev`（或等效指令）產生 `prisma/migrations/<timestamp>_add_saved_food_brand/` migration 並套用（依賴 T002）
- [X] T004 [P] 在 `src/lib/saved-food-matching.ts` 的 `SavedFoodMatchCandidate` 新增 `brand?: string | null`，並在 `findSavedFoodMatches()` 新增 FR-012 的廠牌比對分支（同廠牌正規化後相等＋品項名稱相等或互相包含 → `reason: "brand"`；`brand` 為空的既有紀錄不參與，見 data-model.md §1／research.md §4）
- [X] T005 [P] 在 `src/lib/b2-crypto.ts` 擴充 `encryptSavedFoodWrite()`／`decryptSavedFood()`，加解密 `brand`（`encryptJson`／`decryptField`，比照 `encName`）
- [X] T006 [P] 在 `src/lib/validators.ts` 新增 `brandSearchSchema`（`brand` 1–80 字必填、`itemName` 1–120 字必填，見 data-model.md §2）；擴充 `savedFoodSchema` 新增選填 `brand`（1–80 字）並在 `source` 列舉新增 `"BRAND_SEARCH"`
- [X] T007 [P] 在 `src/lib/rate-limit.ts` 新增 `enforceBrandSearchRateLimit(userId)`（獨立於 `enforceAiRateLimit`，保護共用 Tavily 配額，例如 `brand-search:${userId}` 10 次／10 分鐘，見 research.md §5）
- [X] T008 [P] 新增 `src/lib/web-search.ts`：以 `fetch` 呼叫 Tavily Search API 的薄封裝，函式簽章 MUST 接受選填的 `signal?: AbortSignal` 參數並原樣傳入底層 `fetch()`（供 T013 以單一 `AbortController` 控制整體逾時，見 research.md §5）；內部仍讀取 `WEB_SEARCH_TIMEOUT_MS` 作為未帶入外部 `signal` 時的預設逾時，未設定金鑰時拋出可與逾時／連線失敗區分的錯誤（供路由對應 503 vs 502，見 research.md §1、§6）
- [X] T009 在 `src/lib/ai.ts` 新增 `analyzeBrandSearchCandidates()`：走 `config.textModel`，以 `createCompletion`／`completionOptions({ json: true })`／`withAgent("brand-search-analysis", config.textModel, ...)` 呼叫（比照 `analyzeMealDescription`），輸入為搜尋結果文字＋使用者輸入的廠牌／品項，輸出最多 5 筆候選（`name`／`packageInfo`／`calories`／`protein`／`fat`／`carbs`），缺漏欄位一律 `null`、不得捏造（FR-008，見 research.md §2）；函式簽章 MUST 接受選填的 `signal?: AbortSignal` 參數並透傳給 `createCompletion`／底層 AI SDK 呼叫（供 T013 以單一 `AbortController` 控制整體逾時，見 research.md §5）（依賴 T008 定義的搜尋結果形狀）
- [X] T010 [P] 在 `src/components/saved-foods-manager.tsx` 的 `SOURCE_LABELS` 新增 `"BRAND_SEARCH": "品牌搜尋"`，並在食物清單／編輯表單顯示與可編輯 `brand` 欄位
- [X] T011 [P] 擴充 `src/app/api/saved-foods/route.ts` 的 `GET`／`POST`：接受請求中的 `brand`、於 `existingFoods`／回應中帶入 `brand`（依賴 T005、T006）
- [X] T012 [P] 擴充 `src/app/api/saved-foods/[id]/route.ts` 的 `PATCH`：接受並可更新 `brand`、於回應與比對候選中帶入 `brand`（依賴 T005、T006）

**Checkpoint**: Foundation 就緒，可開始任一 User Story 的實作

---

## Phase 3: User Story 1 - 依廠牌與品項搜尋並自動建立營養標示 (Priority: P1) 🎯 MVP

**Goal**: 使用者輸入廠牌＋品項名稱 → 系統搜尋並由 AI 判斷出候選營養標示 → 使用者確認（可修改）→ 存入「我的食物」，來源標示為「品牌搜尋」

**Independent Test**: 輸入公開可查到營養標示的廠牌與品項名稱，確認回傳候選並可成功存入一筆「我的食物」紀錄（quickstart.md 情境 1）

### Implementation for User Story 1

- [X] T013 [US1] 在 `src/app/api/foods/brand-search/route.ts` 新增 `POST` 路由：`requireUser()` → `enforceBrandSearchRateLimit(user.id)` → `enforceAiRateLimit(user.id)` → `brandSearchSchema.parse()` → 呼叫 `webSearch()`（T008）取得搜尋結果 → `analyzeBrandSearchCandidates()`（T009）→ 回傳 `{ candidates: [] }`（查無結果，200，非錯誤，FR-007）或候選陣列；依 contracts/brand-search-api.md 對應錯誤狀態碼（400 驗證、401 未登入、429 速率限制、503 未設定 `TAVILY_API_KEY`、502 搜尋逾時／AI 判斷失敗），全程不寫入資料庫（FR-011）；路由 MUST 建立單一 `AbortController`，並將其 `signal` 傳入 `webSearch()`（T008）與 `analyzeBrandSearchCandidates()`（T009）兩者，強制整體伺服器端耗時上限 ≤25 秒（而非僅為設計目標，見 research.md §5），超時中止並回傳 502，確保 SC-001 的 30 秒使用者可感知上限有實際程式碼強制執行（依賴 T006、T007、T008、T009）
- [X] T014 [US1] 在 `src/components/meal-capture-form.tsx` 新增「品牌搜尋」入口：比照現有「上傳營養標示」按鈕位置，新增「廠牌」「品項名稱」兩個必填輸入欄位與觸發按鈕（兩欄皆填妥才可觸發，FR-001），呼叫 `POST /api/foods/brand-search`（依賴 T013）
- [X] T015 [US1] 在 `src/components/meal-capture-form.tsx` 新增單一候選確認 UI：呈現 AI 候選的 `name`／`packageInfo`（映射為 `estimatedAmount`）／`calories`／`protein`／`fat`／`carbs`，皆可編輯，並標示「AI 估算值」（FR-006）；四項營養數值任一為空時禁用送出（FR-005、FR-008）；擴充 `saveAsSavedFoodInternal()` 使其可傳入 `brand` 並在送出時帶上 `brand`＋`source: "BRAND_SEARCH"`（沿用既有 409 `savedFoodConflict` 重複提示 UI，含新的 `reason: "brand"`，不需新增分支）
- [X] T016 [US1] [P] 在 `mobile/lib/models/saved_food.dart` 新增 `brand` 欄位（`fromJson` 解析），`source` 允許值文件中補上 `'BRAND_SEARCH'`
- [X] T017 [US1] [P] 在 `mobile/lib/services/saved_food_service.dart` 的 `create()`／`update()` 新增 `brand` 參數並帶入請求 body；在 `mobile/lib/services/meal_service.dart` 新增 `analyzeBrandSearch(String brand, String itemName)`（比照 `analyzeNutritionLabel`，呼叫 `POST /api/foods/brand-search`，回傳候選清單）（依賴 T013 的回應格式）
- [X] T018 [US1] 在 `mobile/lib/widgets/meal_capture_form.dart` 新增「品牌搜尋」入口與單一候選確認 UI：比照現有「上傳營養標示」按鈕（`_scanNutritionLabel`）位置，新增廠牌／品項名稱輸入、觸發搜尋、候選欄位可編輯、四項營養數值未填齊時禁用送出、標示「AI 估算值」，送出時呼叫 `SavedFoodService.create()` 並帶 `brand`／`source: 'BRAND_SEARCH'`（依賴 T016、T017）

**Checkpoint**: User Story 1 應可完整獨立運作與測試（quickstart.md 情境 1）

---

## Phase 4: User Story 2 - 多筆候選商品時由使用者選擇正確項目 (Priority: P2)

**Goal**: 搜尋結果對應多筆商品時列出候選清單（最多 5 筆）供使用者選擇，選定後才顯示確認畫面

**Independent Test**: 輸入已知有多種包裝規格／口味的廠牌與品項，確認列出多筆候選而非自動套用，選定其中一筆後才顯示對應營養標示（quickstart.md 情境 2）

### Implementation for User Story 2

- [X] T019 [US2] 在 `src/components/meal-capture-form.tsx`：當 `/api/foods/brand-search` 回傳多筆候選時，先渲染可選清單（顯示 `name`＋`packageInfo` 以利辨識差異，最多 5 筆），選定其中一筆後才進入 T015 的確認 UI（依賴 T015）
- [X] T020 [US2] [P] 在 `mobile/lib/widgets/meal_capture_form.dart` 比照新增多筆候選清單選擇步驟，選定後進入 T018 的確認 UI（依賴 T018）

**Checkpoint**: User Story 1、2 應皆可獨立運作（quickstart.md 情境 2）

---

## Phase 5: User Story 3 - 查無結果時提供替代新增方式 (Priority: P3)

**Goal**: 查無結果或搜尋／AI 判斷失敗時，清楚告知使用者並提供切換至手動輸入或上傳照片的入口

**Independent Test**: 輸入查不到公開營養標示的虛構品牌與品項，確認顯示查無結果訊息並可經由入口改用既有方式完成新增（quickstart.md 情境 3）

### Implementation for User Story 3

- [X] T021 [US3] 在 `src/components/meal-capture-form.tsx`：當候選為空陣列（查無結果，FR-007）或 `/api/foods/brand-search` 回傳 503／502 等錯誤（FR-011）時，顯示對應訊息，並提供切換 `mode` 至 `"manual"`／`"photo"` 的明確入口（依賴 T019）
- [X] T022 [US3] [P] 在 `mobile/lib/widgets/meal_capture_form.dart` 比照新增查無結果／錯誤訊息與切換至手動輸入／上傳照片入口（依賴 T020）

**Checkpoint**: 三個 User Story 應皆可獨立運作（quickstart.md 情境 3）

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨 Story 的收尾檢查，含 SC-001（整體逾時上限）與 SC-002（常見品牌命中率）的驗證證據

- [X] T023 [P] 執行 `npm run lint` 與 `tsc --noEmit`（或 `npm run build`），修正所有異動檔案中的問題（`npm run lint` 在本環境因既有、與本功能無關的 Next.js 16 升級移除 `next lint` 而全域性失效，改以 `tsc --noEmit`（全專案通過，僅剩與本功能無關的既有 `src/worker.ts`/bullmq 錯誤）與 Docker 內 `next build` 成功建置作為替代驗證證據，符合 plan.md Testing 段落允許的替代方案）
- [ ] T024 依 `specs/001-brand-nutrition-search/quickstart.md` 手動執行情境 1–3 與 6 個 Edge Cases（含暫時移除 `TAVILY_API_KEY` 驗證 503 路徑），於 `npm run dev` 環境完整驗證
- [ ] T025 [P] 於實機或模擬器上重複 quickstart.md 情境 1–3，確認 Web／Android 行為一致；本功能已將 Android／Flutter 端變更（T016–T018、T020、T022）納入本任務清單範圍，依憲章原則 IV（Web 與 Android 版本同步發佈）此驗證為必要項目，不得省略或視為選做
- [ ] T026 [P] 依 `specs/001-brand-nutrition-search/quickstart.md`「SC-002 驗證程序」章節列出的固定樣本清單（至少 20 筆台灣市售常見品牌包裝食品），逐一執行品牌搜尋並記錄命中（回傳 ≥1 筆候選）筆數與總筆數，確認命中率 ≥85%（SC-002）；未達標時記錄查無結果的品項，供後續調整搜尋查詢字串組成方式（依賴 T013）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：無相依，可立即開始
- **Foundational (Phase 2)**：依賴 Setup 完成——阻擋所有 User Story
- **User Stories (Phase 3+)**：皆依賴 Foundational 完成
  - US1（P1）為 MVP，建議優先完成
  - US2（P2）在 UI 層依賴 US1 的確認畫面（T015／T018）
  - US3（P3）在 UI 層依賴 US1／US2 已建立的搜尋流程（T019／T020）
- **Polish (Phase 6)**：依賴所需的 User Story 皆已完成；T026（SC-002 命中率驗證）另依賴 T013（後端路由）已完成

### User Story Dependencies

- **User Story 1 (P1)**：Foundational 完成後即可開始，不依賴其他 Story
- **User Story 2 (P2)**：需要 US1 的確認 UI（T015/T018）已存在，才能接上候選清單選擇步驟
- **User Story 3 (P3)**：需要 US1/US2 的搜尋觸發流程（T019/T020）已存在，才能接上查無結果／錯誤分支

### Within Each User Story

- 後端路由（T013）先於前端串接（T014/T015）
- Web 與 Android 的對應任務（如 T014/T015 與 T016–T018）可平行由不同人執行，但同一平台內因同檔案需依序
- Story 完整可獨立驗證後才進入下一優先序 Story

### Parallel Opportunities

- Phase 2 中標記 [P] 的任務（T004–T008、T010–T012）可平行執行
- Phase 3 中 T016／T017（Android 端 model／service）可與 T013（後端路由）平行開發，因回應格式已由 contracts/brand-search-api.md 固定
- 不同人力可分別負責 Web（T014/T015/T019/T021）與 Android（T016–T018/T020/T022）兩條軌道

---

## Parallel Example: Foundational Phase

```bash
# Phase 2 中可同時啟動的任務（不同檔案、彼此無相依）：
Task: "擴充 src/lib/saved-food-matching.ts 的 FR-012 廠牌比對分支"
Task: "擴充 src/lib/b2-crypto.ts 的 brand 加解密"
Task: "新增 src/lib/validators.ts 的 brandSearchSchema"
Task: "新增 src/lib/rate-limit.ts 的 enforceBrandSearchRateLimit"
Task: "新增 src/lib/web-search.ts 的 Tavily 封裝"
```

## Parallel Example: User Story 1

```bash
# T013（後端路由）與 Android 端任務可平行進行：
Task: "在 src/app/api/foods/brand-search/route.ts 實作 POST 路由"
Task: "在 mobile/lib/models/saved_food.dart 新增 brand 欄位"
Task: "在 mobile/lib/services/saved_food_service.dart／meal_service.dart 新增 brand／analyzeBrandSearch"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational（關鍵，阻擋所有 Story）
3. 完成 Phase 3：User Story 1（Web 與 Android 可平行）
4. **停下並驗證**：依 quickstart.md 情境 1 獨立測試 US1
5. 視需要部署／展示

### Incremental Delivery

1. Setup + Foundational 完成 → 基礎就緒
2. 加入 User Story 1 → 獨立測試 → 部署／展示（MVP！）
3. 加入 User Story 2 → 獨立測試 → 部署／展示
4. 加入 User Story 3 → 獨立測試 → 部署／展示
5. 每個 Story 皆在不破壞前一個 Story 的前提下疊加價值

### Parallel Team Strategy

- 團隊共同完成 Setup + Foundational
- Foundational 完成後：
  - 開發者 A：Web 前端（T014/T015/T019/T021）
  - 開發者 B：Android 前端（T016–T018/T020/T022）
  - 兩者共用同一個後端路由（T013）

---

## Notes

- `[P]` 任務 = 不同檔案、無相依
- `[Story]` 標籤將任務對應到特定 User Story 以利追蹤
- 每個 User Story 應可獨立完成與測試
- 每完成一項任務或一組邏輯相關任務後提交（commit）
- 可在任一 Checkpoint 停下獨立驗證該 Story
- 避免：模糊任務、同檔案衝突、破壞 Story 獨立性的跨 Story 相依
