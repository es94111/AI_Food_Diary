# 🍽️ AI Food Diary · AI 飲食記錄

> 拍照即記錄。上傳餐點照片，AI 估算熱量與三大營養素，並自動產生下一餐建議與**昨日總結**。Web 與 Android App 共用同一後端與版本。

![version](https://img.shields.io/badge/version-0.39.0-2563eb)
![Next.js](https://img.shields.io/badge/Next.js-App_Router-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Flutter](https://img.shields.io/badge/Flutter-Android-02569B?logo=flutter&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)

---

## ✨ 主要功能

- 📸 **AI 餐點辨識** — OpenAI Vision 由照片估算熱量與蛋白質／脂肪／碳水，可手動修正後讓 AI 依修正內容重新估算。
- 🎯 **精準模式** — 同一張照片多次取樣取「總熱量中位數」，降低每次辨識的飄動。
- 🌙 **昨日總結自動彈窗** — 後端 worker 依**各使用者時區**於凌晨**事前**用 AI 產生昨日總結；App／Web 每日**首次開啟自動彈出**（開啟當下不跑 AI、沒餐點不彈）。
- 🍱 **常用食物 / 營養標示** — 自建食物、產品條碼、營養標示（熱量與營養素皆支援小數輸入）。
- ❤️ **Health Connect 同步**（Android）— 體重、身高、活動消耗，計算當日淨熱量。
- 🔐 **隱私與加密** — AES-256-GCM 欄位級加密；每位使用者自帶 AI 金鑰（加密儲存，後端解密後僅用該使用者的額度）。
- 📱 **Web + Android App** — 共用 API 與版本，一個 `vX.Y.Z` tag 同時發佈兩端。

## 🖼️ 截圖

> 圖檔放在 [`docs/screenshots/`](docs/screenshots/)（檔名說明見該資料夾）。

### Web — 儀表板 / 飲食頁

<p align="center">
  <img src="docs/screenshots/web-dashboard.png" alt="Web 儀表板 / 飲食頁" width="800">
</p>

### App（Android）

<p align="center">
  <img src="docs/screenshots/app-dashboard.png" alt="App 儀表板" width="250">
  &nbsp;
  <img src="docs/screenshots/app-daily-summary.png" alt="App 昨日總結彈窗" width="250">
  &nbsp;
  <img src="docs/screenshots/app-health-sync.png" alt="App 健康同步 / 設定" width="250">
</p>

<p align="center"><sub>儀表板 · 昨日總結彈窗 · 健康同步 / 設定</sub></p>

## 🧱 技術架構

| 層 | 技術 |
|----|------|
| 前端（Web） | Next.js App Router + TypeScript |
| 前端（App） | Flutter（Android）|
| 資料庫 | Prisma + PostgreSQL |
| 認證 | Argon2id 密碼雜湊 · JWT HttpOnly Cookie Session |
| 加密 | AES-256-GCM 欄位加密 |
| AI | OpenAI Responses API（支援 OpenAI-compatible endpoint）|
| 背景工作 | Redis + BullMQ worker（昨日總結事前產生）|
| 部署 | Docker Compose：app · worker · postgres · redis · minio |

## 🚀 快速開始

1. 安裝 Node.js 22+ 與 Docker。
2. 複製 `.env.example` 為 `.env`。
3. 產生 32-byte base64 加密金鑰並填入 `ENCRYPTION_KEY`：

   ```powershell
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   ```

4. 填入 `AUTH_SECRET` 與 `OPENAI_API_KEY`。
   - 使用 OpenAI 官方 API 時可留空 `OPENAI_BASE_URL`。
   - 使用 OpenAI-compatible API 時，將 `OPENAI_BASE_URL` 設為相容服務的 `/v1` endpoint，例如 `https://api.example.com/v1`。
5. 啟動服務：`docker compose up --build`（會一併啟動 **worker**，昨日總結排程才會運作）。
6. 開啟 <http://localhost:3000>。

## 🛠️ 本機開發

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev          # Web
npm run worker       # 背景排程（昨日總結事前產生）
```

## ⚙️ 進階設定

### Prompt 設定

可在 `.env` 修改 AI 提示語，修改後重啟 app／worker 即可套用：

```env
AI_MEAL_ANALYSIS_PROMPT="餐點圖片分析提示語"
AI_NEXT_MEAL_ADVICE_PROMPT="下一餐建議提示語"
AI_DAILY_SUMMARY_PROMPT="每日總結提示語"
```

- `AI_NEXT_MEAL_ADVICE_PROMPT` 模板變數：`{{goal}}`、`{{calorieTarget}}`、`{{todayCalories}}`、`{{todayProtein}}`、`{{todayFat}}`、`{{todayCarbs}}`。
- `AI_DAILY_SUMMARY_PROMPT` 模板變數：`{{date}}`、`{{calorieTarget}}`、`{{totalCalories}}`、`{{totalProtein}}`、`{{totalFat}}`、`{{totalCarbs}}`。

### 辨識穩定度調校

為了縮小「同一張照片每次辨識熱量飄動」的問題，所有 AI 呼叫都會帶入低 `temperature` 與固定 `seed`，並對回傳 JSON 的呼叫啟用 JSON mode；餐點照片提示語也改為「估份量（公克）→ 取每 100g 密度 → 份量×密度」的分步估算。以下變數皆為選填，可在 `.env` 覆寫後重啟 app／worker：

```env
AI_ANALYSIS_TEMPERATURE="0.2"             # 越低越穩定，辨識類任務建議 0~0.3
AI_ANALYSIS_SEED="42"                     # 固定種子（OpenAI 系支援，部分相容服務會忽略）
AI_MEAL_ANALYSIS_SAMPLES="3"              # 精準模式取樣次數，設 1 可停用
AI_MEAL_ANALYSIS_SAMPLE_TEMPERATURE="0.5" # 精準模式各次取樣的 temperature
```

**精準模式**：拍照新增餐點時可勾選「精準模式」，後端會對同一張圖跑 `AI_MEAL_ANALYSIS_SAMPLES` 次，取**總熱量中位數**的結果，飄動更小（代價是分析較慢、token 用量約為取樣次數倍）。`temperature`／`seed`／JSON mode／分步估算對 Web 與手機 App 自動生效；精準模式勾選框目前僅在 Web。

## 📦 發版與 CI

WEB 與 APP 共用**一個版本 tag**。推送 `vX.Y.Z` tag 會同時觸發兩個 workflow，版本號從 tag 流向各處。

```bash
git tag v0.1.0
git push origin v0.1.0
```

- `android-apk.yml`：`flutter build apk --release`，上傳 `downloads/ai-food-vX.Y.Z.apk` 與 `ai-food-latest.apk` 至 S3。
- `docker-image.yml`：建置並推送 Docker image `:X.Y.Z` 與 `:latest`。

需要在 GitHub repository secrets 設定：

```text
DOCKERHUB_USERNAME=你的 Docker Hub 帳號
DOCKERHUB_TOKEN=你的 Docker Hub access token
DOCKERHUB_IMAGE=你的 Docker Hub image，例如 username/ai-food-diary
```

> 安全掃描（gitleaks／Semgrep／Trivy／OSV／MobSF）改為**每天 03:00（Asia/Taipei）**排程執行，可於 GitHub Actions 手動觸發。

## 📝 備註

- AI 營養分析為估算值；使用者可在 Web／App 修正餐點項目後重新辨識。
- 目前圖片以 data URL 送到 AI，不會保存到 MinIO；MinIO 已在部署環境預留，下一步可改為 private bucket + signed URL。
- Docker runtime 使用 `prisma db push` 方便啟動；正式環境建議改為 migration 流程。
- 昨日總結排程跑在 **worker** 程序，請確認 worker 與 app 使用相同 env（加密金鑰、`DATABASE_URL`、`REDIS_URL`）。
- 磁碟加密屬基礎設施控制；部署 PostgreSQL、MinIO/S3、Docker volume、備份與 VM 磁碟時請依 `docs/disk-encryption.md` 驗證。
