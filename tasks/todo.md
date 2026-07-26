# 2026-07-09 typescript-7-upgrade

## Goal + Acceptance Criteria
- [x] Restate goal: upgrade the project TypeScript dependency from 6.x to 7.x.
- [x] `package.json` declares TypeScript 7.x.
- [x] `package-lock.json` resolves TypeScript 7.x consistently.
- [x] Verification confirms the installed compiler is TypeScript 7.x.
- [x] Run available static/build checks, or document exact blockers.

## Risk & Rollback
- Risk level: low to medium.
- Affected components: TypeScript compiler, Next.js type checking, `tsx` scripts that depend on compiler/runtime compatibility.
- Rollback strategy: revert `package.json` and `package-lock.json`, then run `npm install`.
- Deployment/ops notes: no runtime config, schema, auth, or secret changes expected.

## Dependencies & Environment
- Package manager: npm with `package-lock.json`.
- Current observed TypeScript: 6.0.3.
- npm registry latest TypeScript 7.x observed on 2026-07-09: 7.0.2.
- Next.js TypeScript 7 compatibility package observed on 2026-07-09: `@typescript/native-preview` 7.0.0-dev.20260707.2.

## Checklist
- [x] Review repo notes and current TypeScript setup.
- [x] Check npm registry for available TypeScript 7.x version.
- [x] Install TypeScript 7.x and update lockfile.
- [x] Verify installed compiler version.
- [x] Run type/build verification.
- [x] Summarize changes and verification story.
- [x] Record lessons if a correction or postmortem occurs.

## Working Notes
- `tasks/lessons.md` was not present at session start.
- TypeScript 7.0.2 no longer exposes the old compiler API at `typescript/lib/typescript.js`; `require("typescript")` resolves to `lib/version.cjs` and exposes version metadata only.
- Next.js 16.2.9 still checks for `typescript/lib/typescript.js` in `verify-typescript-setup`, so `@typescript/native-preview` is required to make Next use its built-in native TypeScript transition path.
- Stable `typescript-eslint` 8.63.0 still declares peer support as `typescript >=4.8.4 <6.1.0`; npm install/build proceed with warnings.

## Results
- Updated `package.json` to pin `typescript` 7.0.2.
- Added `@typescript/native-preview` 7.0.0-dev.20260707.2 for Next.js TypeScript 7 compatibility.
- Updated `package-lock.json` for TypeScript 7 platform optional packages and native preview packages.
- Changed `npm run build` to run `prisma generate && tsc --noEmit && next build`, so TypeScript 7 checking happens before Next skips its incompatible legacy typecheck path.

## Verification
- `npm ls typescript @typescript/native-preview --depth=0` -> TypeScript 7.0.2 and native preview 7.0.0-dev.20260707.2 installed.
- `npx tsc --version` -> Version 7.0.2.
- `npx tsc --noEmit` -> passed.
- `npm run build` with local dummy `AUTH_SECRET` and `DATABASE_URL` -> passed after clearing stale `.next`.
- `npm run lint` -> failed because existing script runs `next lint`, and this Next CLI treats `lint` as an invalid project directory; no ESLint config file is present.
- `npm ci --dry-run --ignore-scripts` -> inconclusive because npm dry-run used cache-only mode and local cache lacked `eslint`; `npm install --package-lock-only --ignore-scripts` passed.

# 2026-07-16 saved_food_management_batch_1

## Goal + Acceptance Criteria
- [x] Restate goal: complete the ten saved-food management improvements on Web and Mobile without a major database change.
- [x] Rename the saved-food catch-all tab from "我的新增" to "全部".
- [x] Quick-add shows every favorite and at most ten nonfavorite recommendations.
- [x] Saved-food management supports name/barcode search and list sorting.
- [x] Recent contains at most 30 foods.
- [x] Every new-food path defaults `isFavorite` to false.
- [x] Barcode lookup does not increment `useCount`; usage is recorded only after a meal saves successfully.
- [x] Archived foods have a separate tab and can be restored.
- [x] Exact barcode duplicates cannot be overridden; similar foods require explicit confirmation.
- [x] The creation form starts collapsed.
- [x] Web build, Flutter analyze/test, formatting, and diff checks pass or exact blockers are recorded.

## Risk & Rollback
- Risk level: medium.
- Affected components: saved-food API, Web saved-food manager/meal form, Mobile saved-food manager/meal form and API error handling.
- Database impact: none; reuse existing `archivedAt`, `useCount`, `lastUsedAt`, and `(userId, barcode)` unique index.
- Rollback strategy: revert only the listed saved-food and meal-capture files; no migration or data rollback is required.
- Monitoring signals: duplicate-food HTTP 409 responses, saved-food restore failures, and usage-update failures after meal creation.

## Dependencies & Environment
- Web: Next.js 16, TypeScript 7, Prisma 7; build needs valid-shaped `AUTH_SECRET` and `DATABASE_URL`.
- Mobile: Flutter/Dart versions pinned by `mobile/pubspec.yaml`; no new package dependency planned.
- Existing unrelated untracked files must remain untouched.

## Checklist
- [x] Read the handoff and inspect the current Backend/Web diff.
- [x] Locate Mobile models, services, saved-food manager, quick-add, and meal confirmation flow.
- [x] Implement structured duplicate errors and archived-list/restore service calls.
- [x] Implement Mobile tabs, search, sorting, recent cap, collapsed form, restore, and duplicate confirmation.
- [x] Implement Mobile quick-add limits, nonfavorite defaults, and post-save usage counting.
- [x] Add focused regression coverage.
- [x] Run formatting, Flutter analyze/test, Web build, and `git diff --check`.
- [x] Review the final diff for ownership, duplicate, archive, usage, and privacy boundaries.
- [x] Record final results and verification evidence.

## Working Notes
- Backend/Web changes were already present in the primary worktree and initially passed `git diff --check`.
- The handoff's old agent worktree is explicitly corrupted and will not be used; Mobile work starts from the primary worktree files.
- Saved-food names are encrypted, so duplicate-name matching remains an in-memory backend operation after decryption.
- Mobile previously incremented usage when a quick-add chip was tapped; usage now moves after successful meal creation and deduplicates retained IDs.
- Existing large Mobile widget files predate this batch; changes will be kept local rather than introducing a broad unrelated split.

## Results
- Backend: added active/archived listing, restore, no-mutation barcode lookup, duplicate/similar detection, legacy-barcode fallback, and failed-create image cleanup without a schema change.
- Web and Mobile: added Favorites / All / Barcode / Recent / Archived views, name/barcode search, sorting, 30-item Recent cap, collapsed creation form, restore, and duplicate confirmation.
- Quick-add now contains all favorites plus at most ten nonfavorites; saved-food usage is counted once per retained food only after a meal saves.
- Mobile API errors preserve status and response data so exact barcode conflicts and similar-name warnings remain distinguishable.

## Verification
- Dart format check on 11 changed/new Dart files -> passed, 0 files changed.
- Flutter analyze with `--no-fatal-infos` -> passed with no warnings/errors; 11 pre-existing info-level null-aware suggestions remain in unrelated services.
- Flutter test -> 5 tests passed, including four saved-food list regression tests and the existing app smoke test.
- `npm run build` -> Prisma generation, TypeScript, Next compilation, and 34/34 static pages passed.
- `git diff --check` -> passed; only Git CRLF conversion notices were printed.
- No files under `prisma/` changed. Existing unrelated untracked paths were left untouched.

# 2026-07-16 saved_food_management_research

## Goal + Acceptance Criteria
- [x] Research current food-diary and high-volume personal-item management patterns using current, attributable sources.
- [x] Compare those patterns with the Mobile "我的食物管理" implementation in this repository.
- [x] Recommend a minimal target information architecture, prioritised roadmap, and measurable success criteria.
- [x] Document assumptions, trade-offs, risks, and verification evidence; make no product-code changes.

## Risk & Rollback
- Risk level: low (read-only product research; documentation task tracking only).
- Affected components: product recommendations for Mobile saved-food management.
- Rollback strategy: remove this task section; no runtime, schema, or user-data change.

## Dependencies & Environment
- Current Mobile implementation and tests are authoritative for shipped behavior.
- Competitive behavior must be checked against current official support/product documentation where available.

## Checklist
- [x] Inspect current Mobile UI, service, model, API, schema, and regression tests.
- [x] Research food-diary competitors and adjacent high-volume list-management patterns.
- [x] Identify the main failure modes for users with many saved foods.
- [x] Produce recommended IA, interaction rules, duplicate/merge policy, and phased delivery plan.
- [x] Define analytics and usability acceptance criteria.
- [x] Record results and source-backed verification story.

## Working Notes
- Existing Mobile tabs: Favorites / All / Barcoded / Recent / Archived.
- Existing controls: name/barcode search and Recommended / Name / Most used / Recently updated / Newest sorting.
- Research should optimize retrieval and automatic maintenance, not simply add more top-level tabs.

## Results
- Compared the working-tree Mobile implementation with current official documentation for MyFitnessPal, Cronometer, Lose It!, YAZIO, MacroFactor, Bevel, and adjacent list-management products.
- Recommended separating long-lived user assets, behavioral shortcuts, and one-off logging; the management surface should be a dedicated lazy-loaded screen rather than an eager list embedded in Settings.
- Recommended a smart logging home, compact personal library, and cleanup assistant with batch archive and user-confirmed duplicate merge.
- Recommended preserving existing meal-history snapshots and archive semantics while adding structured brand/serving fields, meal/recipe templates, and contextual ranking in later phases.
- No product source, schema, migration, or runtime behavior was changed.

## Verification
- Read-only inspection covered Mobile UI/model/service/list tests, saved-food API routes, validation, duplicate matching, Prisma schema, and meal snapshot behavior.
- Competitive findings were checked against current official product/help documentation on 2026-07-16.
- `git diff --check -- tasks/todo.md` is the only repository verification required for this research-only task.

# 2026-07-16 saved_food_management_p0

## Goal + Acceptance Criteria
- [x] Move saved-food management out of Settings into a dedicated Web/Mobile page.
- [x] Render management rows and authenticated photos lazily; changing a filter must not eagerly build every row.
- [x] Quick-add renders at most ten saved foods in total, prioritising favourites.
- [x] Mobile supports long-press selection and batch archive; Web exposes an equivalent explicit multi-select action.
- [x] Add counted smart views for unused, possible duplicates, and incomplete records.
- [x] Create conflicts expose explicit Use / Update / Restore / Save as new actions, with exact-barcode uniqueness preserved.
- [x] Editing an existing food can clear its barcode by sending an explicit `null`.
- [x] Source is read-only after creation and cannot be changed by the edit UI/API.
- [x] Existing ownership, archive, encrypted-name, image-reference, meal-history, and usage-count semantics remain unchanged.

## Risk & Rollback
- Risk level: medium.
- Affected components: saved-food PATCH/create conflicts, Web/Mobile saved-food management, Mobile navigation, meal quick-add.
- Database impact: none; smart views derive from existing fields and duplicate matching remains application-side because names are encrypted.
- Rollback strategy: revert this task's saved-food API/UI/navigation/test files; no migration or data rollback is required.
- Monitoring signals: saved-food HTTP 409/422 responses, batch archive failures, barcode-clear failures, and authenticated image request volume.

## Dependencies & Environment
- Web: Next.js 16, TypeScript 7, Prisma 7; build requires valid-shaped `AUTH_SECRET` and `DATABASE_URL`.
- Mobile: Flutter/Dart versions pinned by `mobile/pubspec.yaml`; no new dependency is planned.
- Existing uncommitted saved-food work is the baseline and must be preserved.

## Checklist
- [x] Checkpoint A: inspect current implementation, tests, and uncommitted baseline.
- [x] Checkpoint B: implement the smallest safe API/Web slice and targeted checks.
- [x] Checkpoint B: implement the dedicated lazy Mobile manager and batch actions.
- [x] Checkpoint C: add regression coverage for smart views, quick-add cap, barcode clearing, and conflict actions.
- [x] Checkpoint C: run TypeScript/build, Flutter format/analyze/test, and diff checks.
- [x] Checkpoint D: review ownership/privacy/image/archive invariants and record rollback notes.
- [x] Summarize results and verification evidence.

## Working Notes
- The P0 list is interpreted as applying to both Web and Mobile where an equivalent surface exists; long-press is Mobile-specific and Web receives explicit selection controls.
- “At most 8–10” is implemented deterministically as ten total quick-add rows, with favourites first and recommendations filling remaining slots.
- “Incomplete” means a blank name/serving amount or no positive calorie/macro value; barcode and photo remain optional and do not make a record incomplete.
- “Possible duplicate” uses normalized equal names for the cleanup view; create-time matching keeps the broader existing name/nutrition heuristic.

## Results
- Web and Mobile Settings now link to dedicated saved-food pages. Mobile uses a sliver builder; Web renders 30 rows at a time and marks authenticated images for lazy decoding/loading.
- Quick-add is capped at ten total items with favourites first. Smart cleanup views show active unused, normalized-name duplicate, and incomplete counts.
- Mobile long-press and Web checkboxes feed an owner-scoped batch archive API; clients chunk selections into at most 100 IDs per request and preserve consistent local state on partial failure.
- Every create surface now offers Use / Update / Restore / Save as new. Exact-barcode save-as clears the new barcode, while conflict payloads include complete owner-scoped food metadata.
- PATCH accepts explicit `barcode: null` and preserves omitted barcodes. Saved-food source is displayed read-only and the API preserves stored provenance even if a crafted PATCH sends another source.
- No Prisma schema or migration changed; archive remains a timestamp update and meal snapshots/image references are untouched.

## Verification
- `npx tsx -e <saved-food validator contract>` -> passed (`barcode: null`, omitted barcode, and batch body parsing).
- `npm run build` with build-only `AUTH_SECRET`/`DATABASE_URL` -> passed; Next compiled 36/36 pages including `/dashboard/foods` and `/api/saved-foods/batch`.
- Targeted Flutter saved-food tests -> 7/7 passed; full `flutter test --no-pub` -> 8/8 passed.
- `flutter analyze --no-fatal-infos` -> passed with no warnings/errors; 11 unrelated pre-existing info-level null-aware suggestions remain.
- Targeted Dart format check on 14 affected files -> passed, 0 changes. Full `lib test` format check still reports 21 unrelated pre-existing files and was intentionally not applied.
- `git diff --check` -> passed; only CRLF conversion warnings were printed.
