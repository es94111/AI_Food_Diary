---
name: release
description: Release a new AI Food Diary version — bump the version, tag vX.Y.Z, push so CI builds the APK to S3 and the Docker image, and create the GitHub Release. Use when the user wants to "發版", "release", cut a new version, or publish web + app together.
---

# Release a new version

WEB and APP share **one** version tag. Pushing a `vX.Y.Z` tag triggers both
CI workflows, and the version flows everywhere from that tag.

## Inputs
Ask the user for the target version `X.Y.Z` if not given. The latest tag is the
current ceiling — bump patch for fixes, minor for features, major for milestones.

## Steps

1. **Make sure the working tree is clean and on `main`** (`git status`,
   `git branch --show-current`). Commit or stop if there are stray changes.

2. **Bump the version in both manifests to `X.Y.Z`:**
   - `package.json` → `"version": "X.Y.Z"` (the web's "目前版本").
   - `mobile/pubspec.yaml` → `version: X.Y.Z+<n>` (bump the `+n` build number;
     CI overrides build-name/number from the tag, this is the local fallback).

3. **Commit** the bump (and any pending work):
   `git commit -am "chore: release vX.Y.Z"` (end with the Co-Authored-By line).

4. **Tag and push** (tag must be `vX.Y.Z`, matching `v*` / `v*.*.*`):
   ```
   git push <remote> main
   git tag vX.Y.Z
   git push <remote> vX.Y.Z
   ```
   The remote is `origin` (points at `es94111/AI_Food_Diary`; `git remote -v` to confirm).

5. **Create the GitHub Release** for the tag (so there's a human-readable
   changelog page):
   ```
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "<繁中更新說明>"
   ```
   - Write the notes in **Traditional Chinese**, matching the project. Summarise
     user-facing changes first (✨ 新功能), then fixes/internal (🔧 其他). Derive
     them from the commits since the previous tag
     (`git log vPREV..vX.Y.Z --oneline`), not boilerplate.
   - The APK is **not** attached to the Release — CI uploads it to S3. If the user
     wants it on the Release page too, after the APK build finishes:
     `gh release upload vX.Y.Z <path-to-ai-food-vX.Y.Z.apk>`.

6. **What the tag triggers (no further action needed):**
   - `.github/workflows/android-apk.yml`: builds `flutter build apk --release`
     with `--build-name=X.Y.Z`, uploads `downloads/ai-food-vX.Y.Z.apk` **and**
     `downloads/ai-food-latest.apk` to S3.
   - `.github/workflows/docker-image.yml`: builds + pushes the Docker image
     tagged `X.Y.Z` and `latest`.

## How the version surfaces (sanity check after CI)
- **App 目前版本**: from the build (`--build-name=X.Y.Z`).
- **App/Web 最新版本**: `GET /api/app/version` → `lib/app-release.ts` parses the
  highest `\d+.\d+.\d+` from the S3 `downloads/` APK filenames (so `ai-food-vX.Y.Z.apk`).
- **Web 目前版本**: `package.json` version (that's why step 2 bumps it).
- **Release notes** (optional): upload `notes/X.Y.Z.md` to the S3 bucket; it shows
  in the in-app update prompt and on the web version card.

## Notes / gotchas
- Deploy is `prisma db push` (Dockerfile), so schema changes apply on container start.
- Google sign-in in CI APKs needs the `GOOGLE_SERVER_CLIENT_ID` GitHub secret
  (empty → button hidden, build still succeeds).
- For one-tap in-app updates to install over an older build, the new APK must be
  signed with the **same key**. CI currently uses the debug key; a fixed release
  keystore is recommended before relying on cross-version updates.
