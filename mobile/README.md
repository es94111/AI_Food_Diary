# AI Food Diary · Android App

Android 前端，使用 **Flutter** 實作，與 Web（Next.js）共用同一個後端
（Prisma + PostgreSQL）與同一個版本號。登入採 Google SSO + Cloudflare
Turnstile 人機驗證，工作階段為 `food_diary_session` HttpOnly Cookie。

## 功能一覽

- 📸 拍照記錄餐點，AI 辨識熱量與三大營養素，可手動修正後重新辨識
- 🍱 常用食物、條碼掃描、營養標示輸入
- 💧 飲水紀錄
- ❤️ Health Connect 同步（體重、身高、活動消耗）
- 🌙 昨日 AI 總結彈窗、下一餐建議
- 📜 AI 操作紀錄（查詢與還原 AI 建立、但非必要的新增資料）
- 🆙 App 內檢查更新並下載新版 APK

完整功能與測試說明見 [`../docs/features.md`](../docs/features.md)；
App 專屬 UI 規格見 [`../docs/ui-design-spec-app.md`](../docs/ui-design-spec-app.md)。

## 開發

```bash
flutter pub get
flutter run                     # 需先啟動後端（見 ../README.md）
flutter test                    # 單元 / Widget 測試
flutter build apk --release     # 產出 release APK
```

Android 版本號與 App 版本來源（`package.json`、`mobile/pubspec.yaml`、S3 上的
APK 檔名）皆由單一 `vX.Y.Z` tag 驅動，發版流程見 [../README.md](../README.md)
的「📦 發版與 CI」。

App 內更新的下載網址由後端 `GET /api/app/version` 提供；正式環境請設定
`APP_PUBLIC_URL`，避免由 request Host 推導來源。
