# Security Fixes — 修復審查發現的全部漏洞

## Goal
修復 tasks/2026-02-06_security-audit 發現的 High/Medium/Low 項目。
原則：最小變更、沿用既有模式（zod/enforceRateLimit/apiRoute）、不破壞 mobile 相容性。

## Checklist
### High
- [x] H1 Google 自動綁定帳號預搶註 → 移除靜默 email 綁定（改明確連結流程）
- [x] H2 docker-compose 暴露埠 → loopback 綁定 + Redis 密碼 + 密碼走 env
### Medium
- [x] M1 /api/me 洩漏密文 → decryptProfile 白名單輸出
- [x] M2 XFF 可偽造 → 取最後一跳 + TRUST_PROXY 文件化
- [x] M3 登入時序側通道 → dummy argon2 verify
- [x] M4 圖片 data URL 無大小上限 → validators 加長度上限
- [x] M5 manualItems/items 無上限 → .max()
- [x] M6 寫入端點缺 rate limit（meals/image append/saved-foods/health sync/batch）
- [x] M7 health/sync raw 無大小限制 → 32KB cap；value 上限
### Low
- [x] L1 precise 模式扣多次額度（rate-limit 加 cost 參數）
- [x] L2 first-user-admin race → serializable tx
- [x] L3 Turnstile QA bypass allowlist 預設拒絕
- [x] L4 密碼 .max(128)
- [x] L5 /api/app/version host 反射 → APP_PUBLIC_URL 優先 + Vary: Host + 警告
- [x] L6 daily-summary/next-meal GET 跨站導航誘觸 → 擋 Sec-Fetch-Site: cross-site
- [x] L7 上游 AI 錯誤原文回顯 → 非 BYO key 時通用訊息
- [x] L8 無效 date 參數 → 400
- [x] L9 eatenAt/drankAt 合理區間
- [x] L10 legacy data:URL Content-Type 白名單；image GET 包 apiRoute
- [x] L11 Dockerfile db push --accept-data-loss → migrate deploy
- [x] L12 admin/settings 錯誤處理（parse→400、catch 只攔 HttpError）
- [x] L13 SSRF：compatible provider fetch 停用 redirect 跟隨
- [x] L14 TURNSTILE_SECRET_KEY 未設時 production 啟動警告
### 不修（記錄理由）
- 註冊 409 列舉/email 搶註：無 email 基礎設施下屬產品取捨，保持現狀
- JWT 加 iss/aud：會強制登出全部既有 session，成本大於效益，暫緩

## Verify
- [x] npx tsc --noEmit（build 內含）— 修好過程中發現的既有型別錯誤（google/register route 的 Prisma 匯入來源、`user` 型別、rate-limit.ts 漏帶 cost 參數）後通過
- [ ] npm run lint — `next lint` 在 Next 16.3.1 已失效（找不到 eslint.config.js，屬既有專案缺口，非本次改動引入），暫略過
- [x] npm run build — 通過（prisma generate + tsc + next build，37 routes 全部產出）
- [x] 手動核對每個 diff 對應發現編號
