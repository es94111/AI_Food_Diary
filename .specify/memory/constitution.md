<!--
Sync Impact Report
- Version change: (unset template) → 1.0.0 (initial ratification)
- Modified principles: n/a (first adoption; all five principles newly defined)
  - I. 使用者文件一律使用繁體中文（不可妥協）
  - II. 最小變更、實證完成
  - III. 敏感資料預設加密
  - IV. Web 與 Android 版本同步發佈
  - V. AI 辨識結果為輔助估算，非最終真相
- Added sections: 技術與架構限制、開發流程與品質關卡、Governance
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ compatible as-is (Constitution Check gate is filled dynamically from this file at plan time)
  - .specify/templates/spec-template.md ✅ compatible as-is (no new mandatory section introduced by these principles)
  - .specify/templates/tasks-template.md ✅ compatible as-is (documentation/localization work fits existing "Documentation updates" polish task)
  - .specify/templates/checklist-template.md ✅ compatible as-is
  - .specify/templates/commands/*.md — N/A (directory does not exist in this installation)
- Follow-up TODOs: none
-->

# AI Food Diary 專案憲章（Constitution）

## Core Principles

### I. 使用者文件一律使用繁體中文（不可妥協）

所有規格書（`spec.md`）、實作計畫（`plan.md`）、任務清單中的使用者故事描述，以及任何面向使用者的文件（README 使用者說明、UI 文案、發版公告等）MUST 以繁體中文（zh-TW）撰寫。程式碼、程式碼註解、commit 訊息，以及供 AI coding agent 使用的內部工程指引（如 `AGENTS.md`）維持既有英文慣例，不受本原則限制。

理由：專案的實際使用者與利害關係人以繁體中文溝通；規格與計畫文件是團隊對齊需求的主要媒介，必須確保所有關係人都能無障礙閱讀與審核，同時保留既有英文工程慣例以降低變動成本。

### II. 最小變更、實證完成

每個變更 MUST 是能完整滿足需求的最小差異；除非能顯著降低風險或複雜度，否則不得順手重構無關程式碼。任何工作在標記完成前 MUST 附上驗證證據：`npm run lint` 與型別檢查（`tsc --noEmit` 或 `npm run build`）通過紀錄，或可重現的手動驗證步驟——「看起來對」不算完成。

理由：延續 `AGENTS.md` 既有的 Operating Principles（Correctness over cleverness／Prove it works），確保變更可稽核、可回溯，降低對生產環境的意外衝擊。

### III. 敏感資料預設加密

使用者密碼、AI 供應商金鑰、健康數據等敏感欄位 MUST 使用專案既有的 AES-256-GCM 欄位加密機制儲存；每位使用者的 AI 金鑰 MUST 彼此隔離，不得共用額度或跨帳號存取。部署或變更 PostgreSQL、MinIO/S3、Docker volume、備份與 VM 磁碟等基礎設施時，MUST 依 `docs/disk-encryption.md` 驗證磁碟加密狀態。

理由：本專案處理使用者飲食與健康隱私資料，加密是既有且不可退讓的資安基線（見 README「隱私與加密」與 `docs/disk-encryption.md`）。

### IV. Web 與 Android 版本同步發佈

Web 與 Android App MUST 共用同一組版本號；發版 MUST 透過推送單一 `vX.Y.Z` git tag 觸發，同時驅動 `android-apk.yml` 與 `docker-image.yml` 兩個 workflow。兩端版本號 MUST NOT 出現不同步的情況。

理由：延續現有發版流程（見 README「📦 發版與 CI」），單一 tag 雙端發佈可避免版本落差造成的相容性問題與維運負擔。

### V. AI 辨識結果為輔助估算，非最終真相

AI 產生的熱量／營養素估算 MUST 於介面上明確標示為估算值；系統 MUST 允許使用者修正餐點項目後重新辨識。AI 呼叫 SHOULD 使用低 `temperature` 與固定 `seed`，並在支援的情況下啟用 JSON mode 以提升結果穩定性；精準模式等取樣策略的參數 MUST 透過環境變數調整，不得寫死於程式碼。

理由：AI 辨識存在固有誤差，必須保留使用者更正的能力並讓其感知這是估算值，同時延續既有的穩定性工程作法（見 README「辨識穩定度調校」）。

## 技術與架構限制

- 前端（Web）MUST 使用 Next.js App Router + TypeScript；前端（Android App）MUST 使用 Flutter。
- 資料庫存取 MUST 透過 Prisma 操作 PostgreSQL；正式環境的 schema 變更 SHOULD 採用 migration 流程，Docker runtime 的 `prisma db push` 僅限開發便利用途。
- 認證 MUST 使用 Argon2id 密碼雜湊與 JWT HttpOnly Cookie session。
- 背景排程（如昨日總結事前產生）MUST 透過 Redis + BullMQ worker 執行；worker 與 app MUST 共用相同的加密金鑰、`DATABASE_URL`、`REDIS_URL` 等環境變數。
- AI 呼叫 MUST 透過 OpenAI Responses API 或相容端點（`OPENAI_BASE_URL`）進行，不得寫死特定供應商的專屬功能。

## 開發流程與品質關卡

- 任何非小型變更 MUST 先確認範圍與驗證方式；複雜或跨檔案變更 SHOULD 先規劃 checkpoint 再實作。
- 送出變更前 MUST 執行 `npm run lint` 與型別檢查（`tsc --noEmit` 或 `npm run build`）。專案目前未設置自動化測試框架，因此可重現的人工驗證步驟為必要替代方案；未來引入測試框架後，新規格 MUST 依 spec 要求補齊自動化測試覆蓋。
- 修正 bug 或處理使用者更正時，MUST 依 `tasks/lessons.md` 慣例記錄失敗模式與預防規則。
- 每次發版 MUST 遵循「Web 與 Android 版本同步發佈」原則，並確認 GitHub repository secrets（Docker Hub 帳密、簽章金鑰等）已就緒。

## Governance

本憲章效力高於其他個別文件或既有慣例；若專案實務與本憲章衝突，MUST 以本憲章為準，或透過下述修訂程序更新憲章。

- **修訂程序**：任何原則的新增、移除或重新定義 MUST 透過 `/speckit-constitution` 提出，並在 Sync Impact Report 中記錄版本異動、受影響的範本與待辦事項。
- **版本規則**：採用語意化版本（MAJOR.MINOR.PATCH）。MAJOR 用於不相容的治理／原則移除或重新定義；MINOR 用於新增原則或實質擴充既有指引；PATCH 用於文字澄清、錯字修正等非語意變更。
- **合規審查**：`/speckit-plan` 產出的 Constitution Check 區塊 MUST 逐條核對本憲章原則；若有違反，MUST 於 `plan.md` 的 Complexity Tracking 中說明理由，否則不得通過該 gate。
- 執行期間的開發指引另見 `AGENTS.md`（AI coding agent 操作規範，維持英文，不受原則 I 語言限制）。

**Version**: 1.0.0 | **Ratified**: 2026-08-21 | **Last Amended**: 2026-08-21
