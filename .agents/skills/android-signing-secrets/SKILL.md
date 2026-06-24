---
name: android-signing-secrets
description: Generate the AI Food Diary Android release keystore and deploy its four signing secrets (ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD) to GitHub Actions so android-apk.yml signs APKs with a stable key. Use when the user wants to "產生 keystore / 設定簽章 secret / 上傳 ANDROID_KEYSTORE_BASE64 / set up APK signing on CI / 換簽章金鑰 / 為什麼 CI 用 debug key". For how the CI consumes them see android-ci-pipeline; to cut a release see release-android.
---

# 產生並部署 Android 簽章 Secrets 到 GitHub CI

目標：建立一把**固定的 release keystore**，把它與三個密碼/別名拆成四個 GitHub
Secrets，讓 `.github/workflows/android-apk.yml` 每次都用**同一把 key** 簽章
（穩定 SHA-1 → Google 登入 + 跨版 OTA 更新）。沒設這些 secret 時 CI 會退回
debug key（見 `mobile/android/app/build.gradle.kts`），舊版裝置無法直接覆蓋更新。

四個 secret 的意義：
| Secret | 意義 |
|--------|------|
| `ANDROID_KEYSTORE_BASE64` | keystore（`.jks`）檔本體，base64 文字 |
| `ANDROID_KEYSTORE_PASSWORD` | 開啟 keystore 的密碼（storePassword） |
| `ANDROID_KEY_ALIAS` | keystore 裡那把金鑰的別名 |
| `ANDROID_KEY_PASSWORD` | 那把金鑰的密碼（keyPassword） |

> 這四個值在 `keytool` 建立 keystore 的當下就全部決定了。之後只是填進 GitHub。

## 前置
- 已安裝 JDK（提供 `keytool`）— 通常 Flutter/Android SDK 已含。
- 已安裝 `gh` CLI 並 `gh auth login`（要走網頁設定也行，見下方替代法）。
- 在 repo 根目錄；remote 為 `es94111`（`git remote -v` 確認）。

## 步驟

### 1. 決定四個值
先想好：keystore 密碼、金鑰密碼（可與前者相同）、別名（例如 `upload`）。
**這些一旦用於正式發版就不能再改**（改了 SHA-1 就變、舊 App 無法更新）。

### 2. 產生 keystore（PowerShell）
非互動式一次帶入所有參數，產出 `release.jks`：
```powershell
$ALIAS = "upload"
$STOREPASS = "<你的-keystore-密碼>"
$KEYPASS   = "<你的-key-密碼>"   # 可與 STOREPASS 相同
keytool -genkeypair -v `
  -keystore release.jks `
  -storetype JKS `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -alias $ALIAS `
  -storepass $STOREPASS -keypass $KEYPASS `
  -dname "CN=AI Food Diary, OU=Mobile, O=Shao, L=Taipei, C=TW"
```
> `-validity 10000` ≈ 27 年，避免憑證提早過期。`-dname` 可自行調整。

### 3. 轉成 base64
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.jks")) `
  | Set-Content -NoNewline release.jks.base64.txt
```
`release.jks.base64.txt` 的內容就是 `ANDROID_KEYSTORE_BASE64`。

### 4. 上傳四個 Secrets 到 GitHub（gh CLI）
```powershell
gh secret set ANDROID_KEYSTORE_BASE64   --repo es94111/AI_Food_Diary --body (Get-Content -Raw release.jks.base64.txt)
gh secret set ANDROID_KEYSTORE_PASSWORD --repo es94111/AI_Food_Diary --body $STOREPASS
gh secret set ANDROID_KEY_ALIAS         --repo es94111/AI_Food_Diary --body $ALIAS
gh secret set ANDROID_KEY_PASSWORD      --repo es94111/AI_Food_Diary --body $KEYPASS
```
> repo slug 用 `gh repo view --json nameWithOwner -q .nameWithOwner` 確認。

**替代法（網頁）**：GitHub → repo → Settings → Secrets and variables → Actions
→ New repository secret，逐一貼上四個名稱與值（base64 那個貼 txt 全部內容）。

### 5. 驗證
- 列出已設的 secret 名稱：`gh secret list --repo es94111/AI_Food_Diary`
  （只看得到名稱，看不到值——正常）。
- 觸發一次 build（手動）：`gh workflow run android-apk.yml --repo es94111/AI_Food_Diary`
  或推一個 `vX.Y.Z` tag。
- 在 Actions log 確認 **"Configure release signing"** 步驟有執行（不是被 skip）——
  被 skip 代表 `ANDROID_KEYSTORE_BASE64` 仍為空。
- 想核對指紋：`keytool -list -v -keystore release.jks -alias $ALIAS -storepass $STOREPASS`
  看 SHA-1，登記到 Firebase/GCP 給 Google 登入用。

### 6. 善後（重要）
- **離線備份** `release.jks` 與四個值（密碼管理器 / 加密保險庫）。遺失 = 永遠
  無法再發出能更新舊版的 App。
- **刪掉工作區的明文檔**，別 commit：
  ```powershell
  Remove-Item release.jks, release.jks.base64.txt
  ```
  （確認 `*.jks` 已在 `.gitignore`；`git status` 不該看到它們。）

## 注意 / 雷點
- 四個值必須**對應同一把 keystore**，錯一個就簽章失敗。
- `key.properties` 的 `storeFile` 在 CI 是相對路徑 `release.jks`（CI 解碼成
  `mobile/android/app/release.jks`），由 build.gradle.kts 的 app module 解析——
  本機要簽章時把 `release.jks` 放在 `mobile/android/app/` 並自建 `key.properties`。
- 已上 Google Play 的 App 若啟用 Play App Signing，這把是「上傳金鑰」；本專案
  目前是側載/S3 分發，這把就是最終簽章 key。
- 換 key = 換 App 身分：舊版使用者必須**移除重裝**，請審慎。
