# Security Audit — 使用者可利用漏洞檢查

## Goal
找出攻擊者（一般 user / 未登入訪客）可實際利用的安全漏洞。

## Plan
- [x] A: 了解核心安全機制（auth/session/turnstile/rate-limit/http）
- [x] B: 逐條 API route 審查（30+ routes）— 4 個平行 reviewer subagents
- [x] C: 上傳/S3、url-guard(SSRF)、web-search、AI proxy
- [x] D: secrets / 加密金鑰 / .env 處理與日誌洩漏
- [x] E: mobile 目錄掃描（hardcoded secrets、Android 設定）
- [x] F: 彙整報告（見 tasks/2026-02-06_security-audit/report.md）

## Results（摘要）
### High
1. **Google 帳號預搶註（Account Pre-Harvesting）**：註冊無 email 驗證，Google 登入以 email 自動綁定本地帳號（src/app/api/auth/google/route.ts:39-45）。攻擊者可搶先用受害者 email 註冊，受害者之後用 Google 登入時被綁進攻擊者帳號 → 共享存取。且系統無改密碼功能、無 session 自助撤銷。已驗證。
2. **docker-compose 將 Postgres(弱密碼)/Redis(無密碼)/MinIO(預設密碼) publish 到 0.0.0.0**（docker-compose.yml:34-52）。公網主機上訪客可直接清空 rate-limit 計數、讀讀寫全庫、讀刪所有圖片。已驗證。

### Medium（擇要）
3. GET/PATCH /api/me 回傳 encryptedAiApiKey 等 AES-GCM 密文（profile-crypto.ts ENC_KEYS 白名單漏列；與程式碼自述「never leak ciphertext」矛盾）。已驗證。
4. getClientIp 取 XFF 第一跳 → 非 Cloudflare 部署下 per-IP rate limit 可輪替繞過（credential stuffing 加速器）。
5. 登入時序側通道可列舉 email（user 不存在時跳過 argon2）。
6. analyze* 端點圖片 data URL 無大小上限（僅 storage.ts 有 6MB 檢查，AI 路徑沒有）→ 數百 MB body 可打掛記憶體。
7. manualItems / items 陣列無上限 → 10萬列 MealItem / AI token 放大。
8. POST /api/meals、meals/[id]/image、saved-foods、health/sync 完全沒有 rate limit → S3/DB 儲存成本攻擊。
9. health/sync 的 raw 欄位 z.unknown() 無大小限制，整包加密入庫。

### Low（擇要）
10. precise:true 一次扣 1 次額度但觸發 5 個平行 AI 呼叫。
11. first-user-admin count-then-create race（兩個 admin 可能性）。
12. Turnstile QA bypass：allowlist 未設時 fail-open；production 未強制停用。
13. 密碼無長度上限 → argon2 CPU 放大。
14. /api/app/version apkUrl 反射 x-forwarded-host（快取污染條件性風險）。
15. GET daily-summary?generate=1 可被外站 top-level 導航誘觸 AI 花費。
16. 上游 AI 錯誤原文回顯（admin fallback key 時洩 relay 內部訊息）。
17. Dockerfile CMD 用 prisma db push --accept-data-loss（重啟可能自動砍欄位，營運資料遺失風險）。已驗證。
18. legacy data:URL 分支 Content-Type 未白名單（現行路徑不可達，縱深問題）；2 個 image GET 未包 apiRoute（401 變 500）。

### 確認無問題（重點正面結論）
- 全部 [id] 路由皆有 userId scope，未發現任何 IDOR
- AES-256-GCM 隨機 IV、key ring 輪替正確；apiKey 明文絕不回顯
- Google ID token 驗證紮實（JWK+issuer+audience+email_verified）
- 無 SQL 注入面（全 Prisma 參數化）、無 eval/dangerouslySetInnerHTML
- .env 未追蹤、mobile/sentry.properties 已 gitignore、無硬編碼 secret
- CSP/HSTS/nosniff/XFO 齊全；CI 有 gitleaks/codeql/semgrep/trivy/osv
- S3 object key 一律 server 產生，無 path traversal

## Verification story
- 4 個平行 reviewer subagents 逐行審查全部 API routes + lib + config + CI
- 高風險發現（#1/#2/#3/#17）由主 agent 親自讀檔二次確認
- 純靜態審查：未執行滲透測試；#4 XFF、#14 host 反射的實際可利用性取決於部署拓撲
