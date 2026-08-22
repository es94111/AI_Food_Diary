# Dashboard frontend implementation

## Goal + Acceptance Criteria
- [x] Replace the narrow dashboard shell with a distinctive, responsive Warm Evidence Desk workspace.
- [x] Preserve existing dashboard data loading, routes, forms, and API behavior.
- [x] Give the Today view a scannable summary, meal rhythm rail, and clear record action.
- [x] Keep mobile layouts usable with 48px targets and no critical horizontal overflow.
- [x] Verify with TypeScript/build checks and a diff review.

## Risk & Rollback
- **Risk level**: medium; visual shell and dashboard composition change, data/API contracts do not.
- **Rollback**: revert dashboard layout/nav/page and global style changes; no schema or dependency migration.

## Dependencies & Environment
- Next.js App Router + TypeScript + Tailwind CSS v4.
- Existing data contracts and client components remain the source of truth.
- No new runtime dependency planned.

## Working Notes
- Direction: Warm Evidence Desk — warm paper canvas, charcoal workspace, amber action color, terracotta food accent, olive health accent.
- Existing `/dashboard`, `/dashboard/health`, `/dashboard/foods`, and `/dashboard/settings` URLs must remain valid.
- The existing page already computes totals, weekly data, water, meals, and target values; redesign should consume those values rather than duplicate business logic.

## Release internal notes
- Technical scope: replace the dashboard shell and today view composition with a responsive CSS workspace; keep existing server-side aggregation, routes, meal capture APIs, hydration actions, and AI summary actions intact; correct weekly multi-image counting; bump web/mobile release metadata to 0.71.0.
- User-facing translation: present the change as a new workbench, faster daily scanning, clearer meal rhythm, and safer narrow-screen date controls without exposing implementation details.

## Results
- Replaced the narrow dashboard shell with a charcoal sidebar, responsive mobile navigation, editorial topbar, and a warm paper workspace.
- Redesigned the Today view around a calorie hero, quick-read pulse, meal rhythm rail, logged-entry list, capture workspace, hydration, and summary modules.
- Kept existing route/query/API contracts and improved weekly image counting for multi-image meals.

## Verification
- `npm run build` -> passed (Prisma generate, TypeScript, Next production build).
- `npx tsc --noEmit` -> passed.
- `git diff --check` -> passed; Git reports only existing LF/CRLF normalization warnings.
- `npm run lint` -> blocked by the existing `next lint` script, which Next 16 treats as an invalid project directory; direct ESLint is also blocked because the repo has no `eslint.config.*`.

---

# 2026-08-10 web-ui-workflow-spec

## Goal + Acceptance Criteria
- [x] 读取 `docs/ui-design-system-shared.md`，明确本轮只设计 Web。
- [x] 确认执行模式与关键 Web 方向。
- [x] 检查仓库入口与现有 Web 代码；记录实际路径为 `src/app/` 与 `src/components/`。
- [x] 建立 `docs/ui-workflow/` 归档目录。
- [x] 生成 Web-specific 需求摘要到兼容路径与归档路径。
- [x] 选择参考搜索方式与额外分析范围：等效 Web 搜索兜底；IA + interaction + content 全选。
- [x] 运行并保存研究报告到 `docs/ui-workflow/01-research-report.md`。
- [x] 运行并保存需求报告到 `docs/ui-workflow/02-need-report.md`。
- [x] 运行并保存形态报告到 `docs/ui-workflow/03-form-report.md`。
- [x] 运行并保存视觉、IA、交互、内容专家报告到 `docs/ui-workflow/04-visual-report.md`、`05-ia-report.md`、`06-interaction-report.md`、`07-content-report.md`。
- [x] 总审核并保存 Web-only 最终规范到 `docs/ui-design-spec.md` 与 `docs/ui-workflow/99-ui-design-spec.md`。
- [ ] 询问是否生成 HTML 原型；未经确认不得生成。
- [ ] 验证文档完整性与生产代码未修改。

## Risk & Rollback
- **Risk level**：低；仅新增/更新设计文档和任务记录，不改变运行时行为。
- **Affected components**：后续 Web UI 实现指导；不影响 Android 原生实现。
- **Rollback**：还原或删除本轮生成的 `docs/ui-workflow/*.md`、`docs/ui-design-spec.md` 与 `docs/ui-need-summary.md`；不需要应用回滚。

## Dependencies & Environment
- Web：Next.js App Router + TypeScript。
- 共享设计基础：`docs/ui-design-system-shared.md`。
- Web 事实来源：`src/app/`、`src/components/`、`src/app/globals.css`、`README.md`。
- 用户选择：深度模式；全域工作台；桌面高信息密度；纳入明暗主题。
- 生产代码约束：本轮不修改 `src/`、依赖、配置或数据库。

## Working Notes
- 仓库不存在 `web/` 目录；不要虚构路径，Web 实际代码在 `src/`。
- 共享规范中有跨平台内容；最终报告必须明确排除 Mobile App，只保留对 Web 有用的共享 token/语义。
- 现有 Web 仍以窄容器、胶囊顶栏和玻璃卡片为主；设计重点是桌面侧栏、可扫描高密度布局、表格/抽屉/状态中心和响应式降级。
- 现有路由以 `/dashboard/*` 为主；任何更细的 IA 路由建议须标注实现迁移成本。

## Results
- 已完成模式确认、仓库探索、共享设计系统读取和 Web 需求方向确认。
- 已写入 `docs/ui-need-summary.md` 与 `docs/ui-workflow/00-need-summary.md`。
- 尚未运行外部研究或专家 Agent，尚未生成最终规范。

## Verification
- 已检查：README、package.json、src/app、src/components、共享设计系统与当前任务记录。
- 观察到：仓库没有 `web/` 目录；当前 Web 代码位于 `src/`。
- 生产代码未修改；后续需用 `git status --short` 与 `git diff --check` 验证。

---

# 2026-08-22 mobile-ui-workflow-spec

## Goal + Acceptance Criteria
- [x] 读取 `docs/ui-design-system-shared.md`，明确本轮只设计 Android 手机原生体验。
- [x] 确认深度模式、目标用户与完整 App 范围。
- [x] 检查 `mobile/` 的 Flutter 入口、主题、饮食记录、健康同步、我的食物与测试/流程。
- [x] 建立 `docs/ui-workflow/` 归档目录。
- [x] 生成 Mobile-App-specific 需求摘要到兼容路径与归档路径。
- [x] 选择参考搜索方式与额外分析范围：TinyFish 选项；当前环境无 TinyFish 工具，使用等效 Web 搜索/抓取兜底；IA + interaction + content 全选。
- [x] 运行并保存研究报告、需求报告、形态报告、视觉报告、IA、交互与内容报告。
- [x] 总审核并保存移动端最终规范到 `docs/ui-design-spec.md` 与 `docs/ui-workflow/99-ui-design-spec.md`。
- [ ] 询问是否生成 HTML 原型；未经确认不得生成。
- [ ] 完成最终文档完整性与生产代码未修改验证。

## Results
- 已完成深度模式 Mobile-App-specific UI/UX 规范；覆盖 Android 导航、触控、安全区、Sheet、全屏表单、键盘、离线、同步、权限、冲突、无障碍与内容策略。
- 已记录冲突处理：复杂 AI 审核使用全屏；根级 CTA 使用 `記錄飲食`；昨日总结改为可召回；负面 AI 评级改为中性方向。
- 未生成 HTML 原型，等待用户二次确认。

## Verification plan
- [x] `git diff --check`（通过；仅有 Git 的 LF/CRLF 提示）
- [x] `git status --short -- mobile src`（无生产路径变更）
- [x] 检查 `docs/ui-workflow/00-need-summary.md` 至 `07-content-report.md`、`99-ui-design-spec.md` 和兼容规范均存在且非空

## Risk & Rollback
- **Risk level**：低；本轮仅新增/更新设计文档和任务记录，不改变 Flutter/Web 运行时行为。
- **Affected components**：后续 Android UI 实现指导；不影响现有生产代码。
- **Rollback**：还原或删除本轮新增的 `docs/ui-workflow/*.md`、`docs/ui-design-spec.md`、`docs/ui-need-summary.md` 及本段任务记录。

## Dependencies & Environment
- Android：Flutter，Material 3；具体版本见 `mobile/pubspec.yaml`。
- 共享设计基础：`docs/ui-design-system-shared.md`。
- 移动端事实来源：`mobile/lib/screens/dashboard_screen.dart`、`mobile/lib/theme/app_theme.dart`、`mobile/lib/widgets/meal_capture_form.dart`、`mobile/lib/widgets/health_sync_card.dart`、`mobile/lib/widgets/saved_foods_manager.dart`、`mobile/.maestro/flows/`。
- 生产代码约束：不修改 `mobile/`、`src/`、依赖、配置或数据库。

## Working Notes
- Android 当前已实现三项底部导航、缓存优先启动、后台 AI 分析和 Health Connect；设计报告需区分“现状”与“建议”。
- 共享规范是跨平台语义基础，不应直接复制 Web 的布局；最终报告必须只保留移动端交互、状态和安全区规则。
- 深度模式需严格按 `need → form → visual → ia → interaction → content` 传递报告。

## 2026-07-11 Android UI refinement

### Goal and acceptance criteria
- [x] Keep the root navigation as `飲食 / 健康 / 設定`.
- [x] Make Today prioritize summary, persistent task state, one primary `記錄飲食` action, and meal review.
- [x] Use a mobile-native source bottom sheet and focused capture/review pages without changing capture or API contracts.
- [x] Apply shared warm amber/terracotta/olive tokens and accessible Material 3 touch targets.
- [x] Preserve Health Connect, background AI, image picker/camera, saved foods, notifications, Google auth, and persistence.

### Risk and rollback
- Medium risk: the authenticated shell and capture entry changed; service/controller boundaries remain intact.
- Roll back by reverting the Android UI/theme/widget changes only; no backend, schema, dependency, or platform integration changes are planned.

### Verification
- [x] Targeted Flutter analyzer: `flutter analyze lib/screens/dashboard_screen.dart lib/screens/meal_capture_screen.dart lib/theme/app_theme.dart lib/widgets/health_sync_card.dart lib/widgets/meal_capture_form.dart lib/widgets/meal_list.dart`.
- [x] Flutter tests: `flutter test` (72 passed).
- [x] `git diff --check` and changed-file scope review.
- [ ] Android APK build: blocked by the workspace/toolchain path mismatch; Kotlin incremental caches reject `C:\Users\...` pub-cache files relative to the `D:\SynologyDrive\...` project, even after `flutter clean`.

### Results
- Refined the authenticated Android shell and moved capture/review into focused native pages.
- Added persistent AI task feedback, session-safe logout cancellation, responsive Health metric grids, accessible capture controls, and shared theme tokens.

---

# 2026-08-22 mobile-ui-release-0.72.0

## Goal + acceptance criteria
- [x] Translate the Android UI refinement into a user-facing Traditional Chinese changelog entry.
- [x] Synchronize web/mobile version metadata to `0.72.0`.
- [x] Commit the scoped changes, squash merge them into `main`, push GitHub, and create the release tag.
- [x] Create the GitHub Release from the verified changelog entry.

## Release internal notes
- Technical scope: publish the existing Android Flutter UI refinement, including focused capture/review routes, persistent background-analysis state, logout cleanup, responsive Health cards, accessibility semantics, and updated tests/flows; no API, schema, dependency, or platform integration changes.
- User-facing translation: describe the new capture entry and full-screen review, clearer Today/Health feedback, larger accessible controls, and safer account switching without exposing implementation names.

## Dependencies and environment
- GitHub CLI is expected at `C:\Program Files\GitHub CLI\gh.exe`.
- No `SRS.md` exists in this repository; README version badge and package/mobile metadata are the available version surfaces.
- Existing untracked `docs/ui-*` design artifacts are preserved but excluded from this release commit because they predate the implementation handoff.

## Verification plan
- [x] Validate `changelog.json` JSON and public-language forbidden-term checks.
- [x] Run web type/build checks if affected by version metadata.
- [x] Run targeted Flutter analyzer and full Flutter tests.
- [x] Review staged scope, commit, PR squash merge, tag, and GitHub Release.

## Results
- Version metadata is synchronized at `0.72.0`; `v0.72.0` points to the squash-merged feature commit on `main`.
- PR #116 was squash-merged, and GitHub Release `v0.72.0` was created from `changelog.json`.
- Existing untracked `docs/ui-*` design artifacts remain intentionally outside the release commits.

---

# 2026-08-22 fix AI meal review keyboard overlap

## Goal and acceptance criteria
- [x] Keep the AI meal review text field visible when the Android keyboard opens.
- [x] Do not change meal editing, re-analysis, save, or navigation behavior.
- [x] Verify the focused field can be edited without the fixed save area covering it.

## Risk and rollback
- **Risk level**: low; scoped to the AI review page keyboard/layout behavior.
- **Rollback**: revert the change in `mobile/lib/widgets/meal_capture_form.dart`; no data or API changes.

## Working notes
- The issue is isolated to `_ConfirmSheet` in `mobile/lib/widgets/meal_capture_form.dart`.
- The current full-screen review adds `viewInsets.bottom` to the scroll body while also rendering the save action as `Scaffold.bottomNavigationBar`; this is the likely double keyboard adjustment/overlap source.

## Results
- Removed the extra keyboard inset from the full-screen AI review body; `Scaffold` now performs the keyboard resize once, so focused fields are not shifted under the lower action area.
- Meal editing, re-analysis, save, and navigation code paths are unchanged.

## Verification
- [x] `cd mobile && flutter analyze lib/widgets/meal_capture_form.dart lib/widgets/meal_list.dart` — passed.
- [x] `cd mobile && flutter test` — 73 tests passed.
- [x] `git diff --check` and final diff review — passed.

---

# 2026-08-22 fix Android in-app update background download

## Goal and acceptance criteria
- [x] APK download completion remains successful when the update dialog is dismissed, another app is opened, or the notification shade is pulled down.
- [x] A temporarily interrupted/resumed download receives a proper partial response instead of becoming a false failure.
- [x] Completed downloads still open the Android installer through the existing foreground/notification flow.
- [x] Existing update permission, retry, and foreground-fallback behavior remains intact.

## Risk and rollback
- **Risk level**: medium; affects mobile update delivery and the APK download endpoint.
- **Rollback**: revert only the update service and range-response changes; no data or schema migration.

## Working notes
- The Android downloader uses WorkManager and resumes partial files with an HTTP `Range` request.
- The deployed `/api/app/download` returned `200 OK` for `Range: bytes=0-0`, confirming that resumed downloads could be rejected by `flutter_downloader`.
- The background completion callback tried to launch the installer while the Activity was inactive; Android can reject that launch and the app then marked a completed download as failed.
- Preserve unrelated working-tree changes in `README.md`, auth/home-widget services, `mobile/lib/services/update_service.dart`, and this task log.

## Plan / checkpoints
- [x] Reproduce/trace the background and resume failure paths.
- [x] Make the smallest client/server fix for interruption-safe download and installer launch.
- [x] Add focused regression coverage where practical; existing analyzer/build checks cover the changed code because this repo has no route integration-test harness.
- [x] Run Flutter analyzer/tests, web type/build checks for the route, and diff/diagnostic verification.

## Results
- `/api/app/download` now forwards validated single-range requests to S3 and returns `206`, `Content-Range`, `Content-Length`, and `Accept-Ranges` for resumable APK downloads.
- Android only attempts the installer while the Activity is resumed; background completion remains successful and the existing download notification handles installation. Lifecycle state is rechecked around the async file/installer handoff.
- No dependency, schema, or API authentication changes were introduced.
- Release metadata is synchronized to `0.72.2` across the Web, Android, README, and changelog surfaces.

## Verification
- `npm run build` — passed (Prisma generate, TypeScript, Next production build).
- `cd mobile && flutter analyze lib/services/update_service.dart` — passed.
- `cd mobile && flutter test` — 73 tests passed.
- `git diff --check` and final pi-lens diagnostics — passed.
- `curl -H "Range: bytes=0-0" https://aifood.shao.one/api/app/download` — current deployment baseline returned `200 OK`; deploy this change and expect `206 Partial Content` with `Content-Range`.
- `flutter build apk --debug` — blocked by the pre-existing Kotlin incremental-cache registration failure across plugin modules on the Synology `D:` workspace, reproduced after `flutter clean` and Gradle daemon stop attempt.

---

# 2026-08-23 fix health sync 500

## Goal + acceptance criteria
- [ ] Health sync POST accepts the existing 92-metric batch instead of returning a generic 500 (requires deployment verification).
- [x] Existing encrypted HealthMetric writes remain compatible with legacy production databases.
- [x] The Android sync path continues to report actionable errors without exposing secrets; no client behavior change was needed.
- [x] Preserve unrelated working-tree changes in `mobile/pubspec.yaml`, `src/app/api/app/download/route.ts`, and `src/lib/storage.ts`.

## Risk & rollback
- **Risk level**: medium; touches the health-sync persistence schema/deployment path.
- **Rollback**: revert the new migration and README change; take a database backup before applying the migration.

## Working notes
- The mobile log proves permission, aggregation, token lookup, and request construction succeeded; the failure starts inside `POST /api/health/sync`.
- The route writes `HealthMetric.value = null` and `encValue`, while the repository had no migration for the encryption columns/nullability. The Dockerfile recently changed from `prisma db push` to `prisma migrate deploy`, making schema drift the leading root cause.
- No `tasks/lessons.md` exists in this repository; no correction/postmortem was required.

## Plan / checkpoints
- [x] Reproduce/trace the API failure path and confirm the smallest schema-compatible fix.
- [x] Add the minimal backward-compatible migration and deployment guidance.
- [x] Add focused regression coverage or a deterministic validation for the changed path.
- [x] Run TypeScript/build, Flutter analyzer/tests as applicable, `git diff --check`, and diagnostics.

## Results
- Added an idempotent migration that adds the HealthMetric encrypted JSON columns and makes the legacy value nullable, covering databases previously maintained by `prisma db push`.
- Updated README deployment guidance to match `prisma migrate deploy`.
- No unrelated working-tree files were changed or reverted; the Flutter dependency-lock change caused by verification was restored.

## Verification
- `npx prisma validate` — passed.
- `npm run build` — passed.
- `cd mobile && flutter analyze lib/services/health_service.dart lib/widgets/health_sync_card.dart` — passed.
- `cd mobile && flutter test` — 72 tests passed.
- Migration assertions — passed; `git diff --check` — passed.
- Live 92-metric sync verification — not run because deployment/database access is not available in this workspace; deploy the image, then retry sync.

---

# 2026-08-23 fix mobile yesterday summary

## Goal + acceptance criteria
- [x] On the first app entry of a new local day, a stored yesterday summary is shown once.
- [x] If the worker did not precompute it, the app retries by generating the past-day summary once; no summary/AI-key/network failure blocks the dashboard.
- [x] Widget summary publishing and current-day dashboard behavior remain unchanged.
- [x] Preserve the previous health-sync migration and unrelated working-tree changes.

## Risk & rollback
- **Risk level**: low; restores the existing summary popup flow in the Android dashboard only.
- **Rollback**: revert the dashboard import/state/helper/call changes; no data or schema changes.

## Working notes
- `mobile/lib/widgets/daily_summary_popup.dart` still implemented the popup, but v0.72.0 removed its dashboard import, the once-per-day guard, and the call from `_refreshAfterEntry`.
- `_loadYesterdaySummaryForWidget` only fetched data for the home widget; it never displayed a summary.
- The server endpoint already supports peek and past-date `generate=1`; the worker remains the preferred path.

## Plan / checkpoints
- [x] Reproduce the missing-display path and compare the previous known-good implementation.
- [x] Restore the smallest once-per-local-day popup flow with safe fallback behavior.
- [x] Add/adjust focused regression coverage where practical; the existing model/widget suite covers the summary contract, and the dashboard analyzer covers the restored path (the overnight UI flow still needs a device repro).
- [x] Run Flutter analyzer/tests, web checks only if touched, `git diff --check`, and diagnostics.

## Results
- Restored the once-per-local-day `昨日總結` popup and the on-demand fallback when the worker has not generated a stored summary.
- Added a lifecycle resume check so returning to an app that stayed open overnight also evaluates the new local day; stale cached summaries are not reused across dates.
- Kept widget publishing and the existing health-sync migration/working-tree changes intact.
- Recorded the missing-call-site regression and prevention rule in `tasks/lessons.md`.

## Verification
- `cd mobile && flutter analyze lib/screens/dashboard_screen.dart lib/widgets/daily_summary_popup.dart` — passed.
- `cd mobile && flutter test` — 72 tests passed.
- `git diff --check` and pi-lens diagnostics — passed.
- Physical overnight/device repro — not run in this workspace; install the updated APK and test once after crossing midnight.

---

# 2026-08-23 release 0.72.3

## Goal + acceptance criteria
- [ ] Bump Web and Android versions to `0.72.3` / Android build `115`.
- [ ] Add a user-facing Traditional Chinese changelog entry for the health-sync and yesterday-summary fixes.
- [ ] Keep the existing migration, summary fix, lessons, and prior working-tree changes in the release commit without silently discarding user edits.
- [ ] Verify, commit on a feature branch, squash-merge into `main`, push GitHub, and create the GitHub Release/tag.

## Risk & rollback
- **Risk level**: medium; release includes an additive database migration and Android behavior fix.
- **Rollback**: revert the release commit and deploy the previous image/APK; the migration is additive and does not delete data.

## Dependencies & environment
- GitHub CLI at `C:\Program Files\GitHub CLI\gh.exe`.
- No `SRS.md` exists in this repository; synchronize the available version surfaces only.
- Docker/Android release workflows run from the pushed version tag.

## Working notes
- Current version is `0.72.2`; this is a patch release (`0.72.3`).
- The repository is currently on `main`; create a release branch and squash-merge it back.
- Existing pre-release changes in `mobile/pubspec.yaml`, `src/app/api/app/download/route.ts`, and `src/lib/storage.ts` must be reviewed and preserved; only the version change to `mobile/pubspec.yaml` is part of this release change.

## Plan / checkpoints
- [x] Update changelog, version metadata, README badge, and release notes.
- [x] Run JSON, forbidden-term, build/analyzer/test, and diff checks.
- [x] Commit and push the release branch; create and squash-merge the PR.
- [x] Confirm the tag and create/update the GitHub Release from the changelog entry.

## Results
- Version surfaces are released as `0.72.3` with Android build `115`.
- PR `#121` was squash-merged into `main` at `d5a9e0b`.
- Annotated tag `v0.72.3` was pushed from the merged `main` commit.
- GitHub Release `v0.72.3` was created from the `changelog.json` entry.
- Existing pre-release formatting changes in `src/app/api/app/download/route.ts` and `src/lib/storage.ts` were intentionally preserved outside this release commit.

## Verification
- `node -e "require('./changelog.json')"` and version/title/length checks — passed.
- Forbidden-term checks for internal IDs, API paths, filenames, review markers — passed.
- `npx prisma validate` — passed.
- `npm run build` — passed.
- Flutter analyzer/tests — passed (72 tests).
- PR checks — passed: Application Build, Android APK, CodeQL.
- Tag checks — passed: Docker image build/push, Android APK, Application Build, CodeQL.
- `git diff --check` — passed.
