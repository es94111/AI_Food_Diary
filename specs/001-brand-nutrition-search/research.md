# Phase 0 Research: 廠牌食品營養標示搜尋

## 1. 網頁搜尋服務選型

**Decision**: 使用 [Tavily Search API](https://tavily.com) 作為取得「該產品公開可查詢營養標示資訊」的搜尋來源，以**營運方層級**（operator-level）的單一 API 金鑰設定（環境變數 `TAVILY_API_KEY`），並包一層薄封裝 `src/lib/web-search.ts`，讓日後可替換供應商而不影響呼叫端。

**Rationale**:
- Tavily 專為 LLM／RAG 應用設計，回傳的是已抽取、乾淨的內容片段（而非原始 HTML），非常適合直接餵給既有的 AI 判斷步驟，減少額外的內容清理工作。
- 有可實際使用的免費額度（每月 1,000 次查詢），符合本專案「自架、個人／小規模使用」的定位，且 SC-002 只要求對常見品牌的抽測命中率，非高流量情境。
- 純 REST + API Key 呼叫，不需 OAuth，與專案現有「後端呼叫外部服務」慣例（S3、Turnstile）一致，易於維運。

**Alternatives considered**:
- **Google Custom Search JSON API**：已於 2026 年宣布不再開放新客戶申請，並將於 2027-01-01 全面停止服務，不適合作為新整合的長期選項。
- **Brave Search API**：已於 2025 年底取消免費額度，改為需先綁定付款方式的 14 天試用後自動轉為計費方案，不利於自架個人專案的可預測成本。
- **Serper.dev**：具備類似的免費額度（約每月 2,500 次），可作為 `src/lib/web-search.ts` 封裝下的備援/替代供應商，但初版先以 Tavily 為主，降低選型複雜度。
- **直接使用使用者所設定 AI 供應商內建的網頁搜尋工具**（如 OpenAI Responses API 的 `web_search` 工具、Gemini 的 grounding）：會將本功能綁死在特定供應商的專屬能力上，違反憲章「AI 呼叫...不得寫死特定供應商的專屬功能」，且使用者可自由切換 OpenAI／Gemini／相容端點的既有設計會因此被破壞（部分供應商不支援等同功能）。故不採用。

## 2. 搜尋與 AI 判斷的呼叫拆分

**Decision**: 「搜尋」與「AI 判斷」拆成兩個獨立步驟，而非要求 AI 供應商自行瀏覽網頁：
1. 後端先呼叫 Tavily，以「廠牌＋品項名稱＋營養標示」組成的查詢字串取得原始搜尋結果（標題＋摘要／抽取內容）。
2. 將搜尋結果整理成文字，交給既有 `src/lib/ai.ts` 的共用管線（`createCompletion`／`completionOptions`／`withAgent`），新增一個 `analyzeBrandSearchCandidates()`，走**文字模型**（`config.textModel`，與 `analyzeMealDescription`／`analyzeManualFoodItems` 相同層級），JSON mode 輸出，缺漏欄位一律回傳 `null`（不得捏造，對應 FR-008），最多整理 5 筆候選（FR-004）。

**Rationale**: 讓 AI 判斷步驟與其餘既有 AI 呼叫（拍照辨識、文字描述辨識、手動評分、重新估算）維持完全相同的形狀：相同的 Sentry `gen_ai.invoke_agent` 觀測慣例、相同的溫度／種子/JSON mode 設定、相同的使用者 BYOK 金鑰隔離。搜尋來源失敗（逾時、無法連線）與 AI 判斷失敗因此可以分開判斷、分開顯示錯誤訊息，也让「查無結果」（FR-007，業務語意上的空結果）與「服務發生錯誤」（FR-011）在程式邏輯上互不混淆。

**Alternatives considered**: 讓 AI 供應商直接「自己上網查」一次到位（單一呼叫）。拒絕，原因同上（綁定特定供應商能力）；且無法在搜尋失敗與 AI 判斷失敗之間做出區分，不利於 FR-007／FR-011 的錯誤訊息設計。

## 3. 「廠牌」欄位的資料模型與加密

**Decision**: 在 `SavedFood` 新增單一欄位 `encBrand Json?`，比照既有 `name`／`estimatedAmount` 使用 `encryptJson`／`decryptField`（`src/lib/b2-crypto.ts`）做欄位級加密，**不**額外保留明文欄位。

**Rationale**: 憲章原則 III 要求健康／飲食相關敏感欄位預設加密；「廠牌」與「品項名稱」同屬使用者飲食識別資訊，比照既有慣例加密可維持一致的資安基線。既有 `name`／`estimatedAmount` 之所以同時保留明文欄位（`name`/`estimatedAmount` 皆為 nullable）與加密欄位，是因為當初從明文遷移到加密經歷了 B1→B2 backfill 過程；`brand` 是全新欄位，沒有既有明文資料需要相容，因此可以直接只用加密欄位，不必背負雙欄位的遷移負擔。

**Alternatives considered**: 明文 `brand String?` 欄位（比照 `barcode`）。拒絕：`barcode` 之所以明文，是因為它需要在資料庫層做唯一性約束（`@@unique([userId, barcode])`）且本身不具識別使用者飲食偏好的敏感性；`brand` 沒有类似的 DB 層查詢/唯一性需求（FR-012 的比對本來就是在應用層對已解密資料做字串相似度比對，見下一節），沒有理由犧牲加密。

## 4. FR-012 重複偵測規則的實作方式

**Decision**: 擴充 `src/lib/saved-food-matching.ts` 的 `SavedFoodMatchCandidate`（新增 `brand?: string | null`）與 `findSavedFoodMatches()`：新增一條獨立分支——當輸入與既有候選**皆**有非空、正規化後相等的 `brand`，且正規化後的品項名稱相等或互相包含（沿用既有 `normalizeFoodText()`），即判定為可能重複（`reason: "brand"`），**不**要求營養數值也相近（既有 `nutritionSimilarity()` 之分數門檻不套用在此分支）。沒有 `brand` 資料的既有舊紀錄（`brand` 為空）不參與此分支比對，其餘既有的條碼／名稱／營養相似度規則維持不變、繼续適用於所有建立來源。

**Rationale**: 直接對應 spec 澄清項目「同廠牌 + 品項名稱相似比對」，且刻意不要求營養數值相近——因為透過網頁搜尋取得、或 AI 重新估算後的數值，即使是同一項產品，也可能與使用者先前手動輸入或另一次搜尋得到的數值有些微落差；若沿用既有的營養相似度門檻，會讓真正重複的同商品因估算誤差而被漏判。此設計只新增一個獨立分支，不更動既有比對邏輯，符合「最小變更」原則。

## 5. 速率限制與逾時預算

**Decision**:
- AI 判斷呼叫沿用既有共用限制 `enforceAiRateLimit`（`ai:${userId}`，40 次／5 分鐘）。
- 另外針對「網頁搜尋」呼叫新增一條較窄的獨立限制（例如 `brand-search:${userId}`，10 次／10 分鐘），保護**營運方共用**的 Tavily 配額（免費層每月僅 1,000 次）不被單一使用者用盡。
- 新增 `WEB_SEARCH_TIMEOUT_MS`（預設 10000ms，環境變數可覆寫，比照既有 `AI_REQUEST_TIMEOUT_MS` 慣例）；`POST /api/foods/brand-search` 路由（見 tasks.md T013）MUST 以單一 `AbortController` 包裹「搜尋＋AI 判斷」兩步驟，實際強制整體伺服器端總耗時 ≤25 秒（而非僅為設計目標），超過上限時中止並回傳 502，為 SC-001 的 30 秒使用者可感知預算保留網路與前端渲染的緩衝。

**Rationale**: Assumptions 段落明確要求「既有的 AI 使用限制（如速率限制、AI 金鑰隔離）比照現行機制套用於本功能」，但 Tavily 配額是**新的、營運方共用**（非使用者各自 BYOK）的資源，既有的 per-user AI 限制並不足以保護它，因此需要一條額外、獨立的限制。

## 6. 搜尋服務未設定時的行為

**Decision**: 當 `TAVILY_API_KEY` 未設定時，端點回傳一個明確、與「查無結果」（FR-007，200 + 空候選陣列）不同的錯誤（服務未設定），讓自架的營運方能一眼看出是設定缺漏而非單純查無資料；使用者端仍會落在既有 `meal-capture-form` 的通用 `error` 顯示與既有「改用手動輸入／上傳照片」入口（與其他 AI 端點失敗時的體驗一致），不影響 FR-007／FR-011 的使用者可用性保證。

**Rationale**: 區分「這次查詢剛好沒有結果」與「這個功能在這台伺服器上根本沒被設定」，避免自架者誤以為功能故障而重複除錯查無結果的情境。
