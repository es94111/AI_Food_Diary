---
name: android-ci-pipeline
description: Reference + troubleshooting for the AI Food Diary Android APK GitHub Actions pipeline (.github/workflows/android-apk.yml) — its triggers, every build step, required secrets, signing/S3 logic, and how to debug a failed or wrong-version build. Use when the user asks "安卓 CI 流程是什麼 / APK build 失敗 / 為什麼版本不對 / why is the APK not on S3 / android-apk.yml 怎麼運作 / Google 登入在 CI 壞掉". To actually cut a release use the `release-android` skill instead.
---

# Android APK CI Pipeline（android-apk.yml）

說明 `.github/workflows/android-apk.yml` 怎麼運作，以及壞掉時怎麼查。
**要實際發版**請用 `release-android` skill；本 skill 是參考 + 排錯。

## 觸發條件（`on:`）
| 方式 | 結果 |
|------|------|
| push tag `v*`（如 `v0.31.0`） | **正式發版**：版號取自 tag |
| push 到 `main` | 每次合併編譯一次（版號取自 pubspec） |
| `workflow_dispatch` 手動 | 測試編譯（版號取自 pubspec） |

> 只有「推 tag」才是正式發版——上傳到 S3 的檔名才會帶正確版號。

## Job: `build-apk`（runs-on: ubuntu-latest）
1. **Checkout**（`actions/checkout@v5`）。
2. **Set up Flutter**（`subosito/flutter-action@v2`，channel `stable`，cache 開）。
3. **Resolve version**（step id `version`）
   - tag 是 `refs/tags/v*` → `VERSION = ${tag#v}`（`v0.31.0` → `0.31.0`）。
   - 否則 → 讀 `mobile/pubspec.yaml` 的 `version:`，取 `+` 前那段。
4. **Install dependencies**：`flutter pub get`（working-directory `mobile`）。
5. **Configure release signing**（`if: ANDROID_KEYSTORE_BASE64 != ''`）
   - base64 解碼出 `mobile/android/app/release.jks`。
   - 寫 `mobile/android/key.properties`（storeFile / storePassword / keyAlias / keyPassword）。
   - 整批用**同一把 release key** 簽章（穩定 SHA-1 → Google 登入 + 跨版 OTA）。
   - secret 缺失 → 退回 debug key（見 `android/app/build.gradle.kts`），fork/PR 仍能編譯。
6. **Build release APK**
   ```
   flutter build apk --release \
     --build-name=<version>          # 來自 step 3
     --build-number=<github.run_number>
     --dart-define=GOOGLE_SERVER_CLIENT_ID=<secret>
   ```
   產物：`mobile/build/app/outputs/flutter-apk/app-release.apk`。
7. **Upload**（二擇一）
   - **S3 齊全**（`S3_ENDPOINT` 且 `S3_BUCKET` 皆非空）：`aws s3 cp` 上傳兩份——
     `downloads/ai-food-v<version>.apk` 與 `downloads/ai-food-latest.apk`。
   - **S3 未設定**：上傳成 GitHub artifact `ai-food-mobile-apk`（fallback）。

## 需要的 GitHub Secrets
| 用途 | Secrets |
|------|---------|
| S3 上傳 | `S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_REGION` |
| 簽章 | `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` |
| Google 登入 | `GOOGLE_SERVER_CLIENT_ID`（空 → 登入鈕隱藏，編譯仍成功） |

## 版本如何串到 App / Web
- **App 目前版本**：build 的 `--build-name=<version>`。
- **App/Web 最新版本**：`GET /api/app/version` → `lib/app-release.ts` 掃 S3
  `downloads/` 內 APK 檔名，取最大的 `\d+.\d+.\d+`（所以檔名格式 `ai-food-vX.Y.Z.apk` 很關鍵）。
- Release notes（選用）：上傳 `notes/X.Y.Z.md` 到 S3，顯示在 App 更新提示與 Web 版本卡。

## 排錯對照表
| 症狀 | 可能原因 / 查法 |
|------|-----------------|
| APK 沒出現在 S3 | `S3_ENDPOINT`/`S3_BUCKET` 任一為空 → 走了 artifact fallback；查 Actions log「Upload APK to S3」是否被 skip。 |
| 「最新版本」沒更新 | 檔名版號沒升、或不是用 tag 觸發（push main 時版號來自 pubspec，可能沒 bump）。確認有推 `vX.Y.Z` tag。 |
| 版號是 pubspec 的舊值 | 沒用 tag 觸發；step 3 fallback 讀了 pubspec。改推 tag。 |
| Google 登入在 APK 壞掉 | `GOOGLE_SERVER_CLIENT_ID` 沒設、或 release 簽章 SHA-1 未登記在 Firebase/GCP。 |
| 舊版裝置無法 OTA 覆蓋安裝 | 簽章 key 不一致——`ANDROID_KEYSTORE_BASE64` 沒設時用 debug key。補上 keystore secrets。 |
| build 簽章步驟被 skip | `ANDROID_KEYSTORE_BASE64` secret 不存在（`if` 守門）。 |
| Flutter 版本問題 | action 用 `stable` channel；本機對齊看 `mobile/pubspec.yaml` 的 `environment.sdk`。 |

## 相關檔案
- `.github/workflows/android-apk.yml` — 本流程。
- `mobile/pubspec.yaml` — 本機版號 fallback（`version: X.Y.Z+n`）。
- `mobile/android/app/build.gradle.kts` — 簽章設定與 debug-key fallback。
- `src/lib/app-release.ts` + `/api/app/version` — 版本對外曝光。
- 同 tag 還會觸發 `.github/workflows/docker-image.yml`（Web 映像）。
