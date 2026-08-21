# Implementation Plan: 廠牌食品營養標示搜尋

**Branch**: `001-brand-nutrition-search` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-brand-nutrition-search/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

使用者在記錄一餐、新增食物項目時，分別輸入「廠牌」與「品項名稱」，系統呼叫外部網頁搜尋服務取得該產品公開可查詢的營養標示資訊，再交由使用者既有的 AI 供應商（OpenAI／Gemini／相容端點）從搜尋結果中判斷、整理出最多 5 筆候選營養標示（熱量、蛋白質、脂肪、碳水化合物），使用者選定候選、確認或修正數值後存入「我的食物」（來源標示為「品牌搜尋」）。技術做法：新增一個不寫入資料庫的伺服器端「搜尋＋AI 判斷」端點，網頁搜尋與 AI 判斷拆成兩個獨立步驟（避免把使用者可替換的 AI 供應商與特定供應商的搜尋工具綁死），並沿用既有「我的食物」建立、重複偵測與確認流程，只擴充其重複偵測規則、並在資料表新增「廠牌」欄位。Web（Next.js）與 Android（Flutter）皆需提供入口，比照既有「上傳營養標示照片」的位置與流程。

## Technical Context

**Language/Version**: TypeScript 7 / Next.js 16（App Router，Web 後端與前端）；Dart / Flutter（Android App）

**Primary Dependencies**: Next.js App Router、Prisma 7（PostgreSQL）、`openai` SDK（既有 `src/lib/ai.ts` chat-completions 抽象，供 OpenAI／Gemini／相容端點共用）、Zod（驗證）；新增一個外部網頁搜尋 REST API（見 research.md 決策，選定 Tavily Search API，以一般 `fetch` 呼叫，不需新增 npm 套件）

**Storage**: PostgreSQL（透過 Prisma）；`SavedFood` 資料表新增一個欄位（廠牌，比照既有 `name`/`estimatedAmount` 採欄位級加密）；搜尋候選結果為請求期間的暫時性資料，不落地儲存

**Testing**: 專案目前未設置自動化測試框架（見憲章）；以 `npm run lint`、`tsc --noEmit`（或 `npm run build`）與 quickstart.md 中的可重現手動驗證步驟作為完成證據

**Target Platform**: Web（瀏覽器 + Next.js server functions）與 Android（Flutter App），兩端呼叫同一組 Next.js REST API

**Project Type**: Web 全端應用（Next.js 單一專案，`src/app/api` 為後端、`src/app`＋`src/components` 為前端）＋ 既有 Flutter Android 用戶端（`mobile/`），兩者共用同一組後端 API，非前後端分離的獨立部署

**Performance Goals**: SC-001 — 使用者觸發搜尋後 30 秒內看到結果（候選或查無結果）；伺服器端「搜尋＋AI 判斷」總耗時以單一 `AbortController` 強制上限 ≤ 25 秒（實際程式碼強制執行，非僅為目標；見 research.md §5、tasks.md T013），逾時中止並回傳 502，為前端顯示與網路延遲保留緩衝

**Constraints**: AI 判斷呼叫必須維持既有的供應商無關設計（不得綁定特定供應商專屬的網頁搜尋工具，見憲章「AI 呼叫...不得寫死特定供應商的專屬功能」）；缺漏欄位不得由 AI 捏造，必須以 `null`／留白呈現（FR-008）；未經使用者確認前不得寫入「我的食物」（FR-005、FR-011、SC-004）

**Scale/Scope**: 新增 1 個後端端點（搜尋＋AI 判斷，無資料庫寫入）＋擴充既有 2 個端點（`POST /api/saved-foods`、`PATCH /api/saved-foods/:id`）＋ 1 個資料表欄位；Web 與 Flutter 各新增 1 處入口 UI（候選清單＋確認畫面），沿用既有確認／重複偵測 UI 架構

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | 原則／限制 | 檢查結果 |
|---|---|---|
| I | 使用者文件一律使用繁體中文 | ✅ Pass — spec.md 與本 plan 皆為 zh-TW；新 UI 文案、錯誤訊息（如「品牌搜尋」「查無結果」）沿用既有 zh-TW 慣例 |
| II | 最小變更、實證完成 | ✅ Pass — 最大化重用既有「我的食物」建立／重複偵測／確認流程與 `src/lib/ai.ts` 的 chat-completion 共用管線，只新增 1 個端點與 1 個資料欄位，不重構無關程式碼；完成前需 `npm run lint`＋型別檢查＋quickstart.md 手動驗證 |
| III | 敏感資料預設加密 | ✅ Pass（設計要求）— 新增的「廠牌」欄位比照既有 `name`/`estimatedAmount`，採 `encryptJson`/`decryptField` 欄位級加密（`encBrand`），不落地明文；每位使用者既有 AI 金鑰隔離機制不變（本功能沿用使用者已設定的 AI 供應商金鑰，不新增 AI 金鑰儲存邏輯） |
| IV | Web 與 Android 版本同步發佈 | ✅ Pass（設計要求）— Technical Context 已將 Web（Next.js）與 Android（Flutter）皆列入範圍，兩端共用同一版號與發版流程，不單獨發佈 |
| V | AI 辨識結果為輔助估算，非最終真相 | ✅ Pass — FR-006 要求標示為 AI 估算值；新 AI 呼叫沿用既有 `ANALYSIS_TEMPERATURE`／`ANALYSIS_SEED`／JSON mode 與 `withAgent` Sentry 觀測慣例，使用者可在確認畫面修正後再送出 |
| 技術限制 | 前端 Next.js＋TS／Android Flutter；DB 經 Prisma／PostgreSQL；AI 呼叫透過 OpenAI 相容端點，不寫死供應商專屬功能 | ✅ Pass — 新增的「網頁搜尋」步驟是一般 REST 呼叫，非 AI 呼叫，因此不受「AI 供應商無關」限制約束；緊接其後的判斷步驟仍走既有 `createCompletion` 共用管線，維持供應商可替換 |
| 開發流程 | 送出前 MUST 執行 lint／型別檢查；無自動化測試框架時以可重現人工驗證替代 | ✅ Pass — 見 quickstart.md |

無違反項目，Complexity Tracking 表格從略。

**Post-Design Re-check（Phase 1 設計完成後）**：research.md 與 data-model.md 的實際設計（加密欄位、供應商無關的搜尋/判斷拆分、FR-012 比對規則）與上表逐條相符，未引入新的違反項目，Constitution Check 維持全數 Pass。

## Project Structure

### Documentation (this feature)

```text
specs/001-brand-nutrition-search/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                          # 擴充 SavedFood：新增 encBrand 欄位
└── migrations/<timestamp>_add_saved_food_brand/

src/
├── lib/
│   ├── ai.ts                              # 新增 analyzeBrandSearchCandidates()（沿用 createCompletion／withAgent／completionOptions）
│   ├── web-search.ts                      # 新增：Tavily 網頁搜尋呼叫的薄封裝（可替換）
│   ├── saved-food-matching.ts             # 擴充 SavedFoodMatchCandidate + findSavedFoodMatches：FR-012 廠牌比對規則
│   ├── b2-crypto.ts                       # 擴充 encryptSavedFoodWrite/decryptSavedFood：加解密 brand
│   ├── validators.ts                      # 新增 brandSearchSchema；擴充 savedFoodSchema/savedFoodPatchSchema 的 brand、source 列舉加 BRAND_SEARCH
│   └── rate-limit.ts                      # 新增搜尋呼叫的獨立速率限制（保護共用搜尋服務額度）
├── app/api/
│   ├── foods/brand-search/route.ts        # 新增：POST 搜尋＋AI 判斷（不寫入資料庫）
│   └── saved-foods/
│       ├── route.ts                       # 擴充：接受/回傳 brand
│       └── [id]/route.ts                  # 擴充：PATCH 可更新 brand
└── components/
    ├── meal-capture-form.tsx              # 新增品牌搜尋入口（比照「上傳營養標示照片」位置）＋候選清單／確認 UI
    └── saved-foods-manager.tsx            # SOURCE_LABELS 新增 BRAND_SEARCH：「品牌搜尋」；顯示/編輯 brand

mobile/lib/
├── services/                              # 新增品牌搜尋 API 呼叫（沿用 meal_service.dart 慣例）
├── models/saved_food.dart                 # 新增 brand 欄位、source 增列 BRAND_SEARCH
└── widgets/meal_capture_form.dart         # 新增品牌搜尋入口與候選/確認 UI（比照現有「上傳營養標示」按鈕位置）
```

**Structure Decision**: 沿用既有單一 Next.js 全端專案結構（`src/app/api` 為後端路由、`src/app`＋`src/components` 為前端），非前後端分離部署；Android 為既有獨立 Flutter 專案（`mobile/`），透過 REST 呼叫同一組 Next.js API。本功能不新增專案或服務，只在上述既有目錄中新增/擴充檔案，維持原有的目錄慣例與命名風格。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

無違反項目 — 本表格從略。
