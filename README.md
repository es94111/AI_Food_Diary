# AI Food Diary

AI 飲食記錄 MVP：登入後可上傳餐點照片，由 OpenAI Vision 估算熱量與營養素，並產生下一餐建議與昨日總結。

## Stack

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Argon2id 密碼雜湊
- JWT HttpOnly Cookie Session
- AES-256-GCM 欄位加密
- OpenAI Responses API
- Redis + BullMQ worker 入口
- Docker Compose: app, worker, postgres, redis, minio

## Setup

1. 安裝 Node.js 22+ 與 Docker。
2. 複製 `.env.example` 為 `.env`。
3. 產生 32-byte base64 加密金鑰並填入 `ENCRYPTION_KEY`。
4. 填入 `AUTH_SECRET` 與 `OPENAI_API_KEY`。
   - 使用 OpenAI 官方 API 時可留空 `OPENAI_BASE_URL`。
   - 使用 OpenAI-compatible API 時，將 `OPENAI_BASE_URL` 設為相容服務的 `/v1` endpoint，例如 `https://api.example.com/v1`。
5. 啟動服務：`docker compose up --build`。
6. 開啟 `http://localhost:3000`。

### Prompt 設定

可在 `.env` 修改 AI 提示語，修改後重啟 app/worker 即可套用：

```env
AI_MEAL_ANALYSIS_PROMPT="餐點圖片分析提示語"
AI_NEXT_MEAL_ADVICE_PROMPT="下一餐建議提示語"
AI_DAILY_SUMMARY_PROMPT="每日總結提示語"
```

`AI_NEXT_MEAL_ADVICE_PROMPT` 支援模板變數：`{{goal}}`、`{{calorieTarget}}`、`{{todayCalories}}`、`{{todayProtein}}`、`{{todayFat}}`、`{{todayCarbs}}`。

`AI_DAILY_SUMMARY_PROMPT` 支援模板變數：`{{date}}`、`{{calorieTarget}}`、`{{totalCalories}}`、`{{totalProtein}}`、`{{totalFat}}`、`{{totalCarbs}}`。

PowerShell 產生加密金鑰範例：

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Local Development

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## Notes

- AI 營養分析是估算值，正式產品應加入使用者修正餐點項目的 UI。
- 目前圖片以 data URL 送到 AI，不會保存到 MinIO；MinIO 已在部署環境預留，下一步可改成 private bucket + signed URL。
- Docker runtime 使用 `prisma db push` 方便 MVP 啟動；正式環境建議改為 migration 流程。
