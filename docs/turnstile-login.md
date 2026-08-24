# Turnstile 登入設定

本版本將既有 Cloudflare Turnstile widget 接到 Web 與 Android 的 Google SSO 登入流程。瀏覽器或 App 只提交一次性 token；後端會在驗證 Google 憑證、查詢帳號或建立 session 前呼叫 Cloudflare Siteverify。

## 部署設定

- 公開 site key：`0x4AAAAAADYFeQGVNASty2ls`
- Server-only secret：`TURNSTILE_SECRET`
- 精確 hostname allowlist：`TURNSTILE_HOSTNAMES`

`TURNSTILE_HOSTNAMES` 是逗號分隔的精確 hostname。開發環境可設定 `localhost,127.0.0.1`（前提是 widget 已註冊這些網域）；正式環境只放實際前端 hostname，例如 `aifood.shao.one`，不可混入本機 hostname。

未設定 secret、hostname allowlist、有效 token、正確 action 或符合的 hostname 時，登入會安全拒絕，不會回退成未驗證登入。Turnstile token 只能使用一次；登入失敗或網路錯誤後，Web 與 Android 都會重設 widget。

## Secret 安全

不要把 secret 放進 Git、公開 env、App 或聊天訊息。既有 widget 的 secret 請依 Cloudflare existing-widget flow，使用受核准的 Wrangler/平台 secret manager 寫入部署環境；本專案只保留 public site key 與設定名稱。

## Smoke test

需要實際登入測試時，使用短效 Google ID token 與新鮮 Turnstile token：

```powershell
./scripts/smoke-test-web.ps1 -GoogleIdToken '<short-lived token>' -TurnstileToken '<fresh token>'
```

未提供 Turnstile token 的 Google 登入請求應被拒絕；token replay 也應被 Cloudflare Siteverify 拒絕。
