---
name: release-android
description: Release the AI Food Diary Android APP — bump the mobile version, push a vX.Y.Z tag, and let CI build the signed release APK and upload it to S3 (downloads/ai-food-vX.Y.Z.apk + ai-food-latest.apk). Use when the user wants to "發版安卓 / 出 APK / 發布 Android App / release the app / cut an APK / build and ship the Android app". For a combined web+app release use the `release` (updata-docx) skill instead.
---

# 發布 Android APK

WEB 與 APP **共用同一個 `vX.Y.Z` tag**。推送 tag 會同時觸發
`android-apk.yml`（出 APK）與 `docker-image.yml`（出 Web 映像）。
本 skill 聚焦在 **Android APP 這條線**：tag → CI 編譯簽章 APK → 上傳 S3。

> 只想做純 App 發版？流程一樣，下面照做即可。要同時把 Web、文件、release
> notes 一起處理時，改用 `release`（updata-docx）skill。

## Inputs
若使用者沒給版本號，先問目標版本 `X.Y.Z`。以最新 tag 為天花板：
修 bug → patch、加功能 → minor、里程碑 → major。
（`git tag --sort=-v:refname | head -5` 看現有版本。）

## Steps

1. **確認工作區乾淨且在 `main`**
   `git status`、`git branch --show-current`。有未提交變更先 commit 或停下。

2. **更新版本號**
   - `mobile/pubspec.yaml` → `version: X.Y.Z+<n>`（把 `+n` build number 加一）。
     CI 會用 tag 覆寫 build-name、用 `github.run_number` 覆寫 build-number，
     這裡的值只是本機 fallback。
   - 若同時要動 Web，順手把 `package.json` 的 `"version"` 也改成 `X.Y.Z`
     （Web「目前版本」來源；純 App 發版可略過，但 tag 仍會重建 Docker 映像）。

3. **Commit**
   `git commit -am "chore: release vX.Y.Z"`（結尾附 Co-Authored-By 行）。

4. **打 tag 並推送**（tag 必須是 `vX.Y.Z`，符合 workflow 的 `v*`）
   ```
   git push es94111 main
   git tag vX.Y.Z
   git push es94111 vX.Y.Z
   ```
   remote 為 `es94111`（`git remote -v` 確認）。

5. **CI 自動完成（無需手動操作）— `.github/workflows/android-apk.yml`**
   1. Resolve version：tag 為 `v*` 時取 `${tag#v}`，否則讀 pubspec。
   2. `flutter pub get`（working-directory: `mobile`）。
   3. **Configure release signing**：當 `ANDROID_KEYSTORE_BASE64` secret 存在時，
      解碼出 `app/release.jks` 並寫 `key.properties`，整批用**同一把 release key**
      簽章（穩定 SHA-1 → Google 登入 + 跨版本 OTA 更新）。secret 缺失時退回
      debug key（fork / PR 仍可編譯）。
   4. `flutter build apk --release --build-name=X.Y.Z --build-number=<run_number>
      --dart-define=GOOGLE_SERVER_CLIENT_ID=<secret>`。
   5. **上傳**：S3 設定齊全時，把 APK 複製成
      `downloads/ai-food-vX.Y.Z.apk` **與** `downloads/ai-food-latest.apk`；
      S3 未設定時改上傳成 GitHub artifact `ai-food-mobile-apk`。

## 需要的 GitHub Secrets
- 上傳：`S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_REGION`。
- 簽章（建議設好，否則用 debug key）：`ANDROID_KEYSTORE_BASE64`、
  `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。
- Google 登入：`GOOGLE_SERVER_CLIENT_ID`（空 → 登入鈕隱藏，編譯仍成功）。

## CI 後的驗收
- **App 目前版本**：來自 build 的 `--build-name=X.Y.Z`。
- **App/Web 最新版本**：`GET /api/app/version` → `lib/app-release.ts` 從 S3
  `downloads/` 的 APK 檔名解析最大的 `\d+.\d+.\d+`（即 `ai-food-vX.Y.Z.apk`）。
- 直接抓檔驗證：`downloads/ai-food-vX.Y.Z.apk` 與 `ai-food-latest.apk` 是否更新。
- Release notes（選用）：上傳 `notes/X.Y.Z.md` 到 S3，會顯示在 App 更新提示與
  Web 版本卡。

## 注意事項 / 雷點
- **OTA 跨版本更新必須同一把簽章 key**。已設 `ANDROID_KEYSTORE_*` secret 才會用
  固定 release keystore；只用 debug key 時，舊版裝置無法直接覆蓋安裝新版。
- Google 登入需要正確的 release 簽章 SHA-1 已登記在 Firebase/GCP，且
  `GOOGLE_SERVER_CLIENT_ID` 有值。
- 也可 `workflow_dispatch` 手動觸發 `android-apk.yml`（不打 tag），版本會改從
  pubspec 讀取，適合測試編譯。
- 本機驗證可在 `mobile/` 跑 `flutter build apk --release`（產物在
  `build/app/outputs/flutter-apk/app-release.apk`），但正式發布一律走 tag → CI。
