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
# 2026-08-09 mobile-performance-and-stability

## Goal + Acceptance Criteria
- [x] Identify a directly observable Flutter APP performance bottleneck and existing errors.
- [x] Implement low-risk optimizations without changing public behavior.
- [x] Add regression coverage for repeated data-URL thumbnail decoding.
- [x] Run available static checks and record the missing Flutter SDK blocker.
- [ ] Commit the verified change and open a PR with verification and rollback notes.

## Risk & Rollback
- Risk level: low to medium.
- Affected components: Flutter dashboard request handling, water-card request handling, async widget lifecycle, and local image thumbnails.
- Rollback strategy: revert the atomic commit; there are no schema, auth, payment, migration, dependency, or config changes.
- Rollout/monitoring: CI should run Flutter analysis/tests/build; observe dashboard date changes, water totals, and thumbnail memory in profile mode.

## Dependencies & Environment
- Flutter/Dart SDK is not installed in this container (`flutter: command not found`).
- No new dependency was added.

## Checklist
- [x] Audit authoritative Flutter code/tests and capture baseline verification.
- [x] Select the highest-value low-risk optimizations and document invariants.
- [x] Cache decoded thumbnail bytes and bound raster decode size.
- [x] Prevent stale meal/water responses and post-dispose state updates.
- [x] Add targeted thumbnail regression tests.
- [x] Run available static checks; record unavailable analyzer/tests/build.
- [x] Review diff for correctness, security/privacy, and performance regressions.
- [x] Document results and verification story.
- [ ] Commit and open a PR.

## Working Notes
- Scope is limited to evidence-backed Flutter improvements; no speculative dependency or architecture changes.
- Invariant: only the newest meal/water load may update screen state or callbacks.
- Invariant: thumbnail source bytes change only when the data URL changes, while decoded raster size is bounded to physical display pixels.
- Independent reviews found no blocking correctness, security, privacy, or performance regression.

## Results
- Added a reusable data-URL thumbnail widget that avoids repeated Base64 allocation during unrelated parent rebuilds and bounds image decode dimensions.
- Replaced three repeated thumbnail decode sites and added widget regression coverage.
- Added generation guards so late meal/water responses cannot overwrite the currently selected date; stale water callbacks no longer publish incorrect totals.
- Added mounted guards to audited async dashboard/profile/health state updates.

## Verification
- `git diff --check` -> passed.
- `rg -n "base64Decode\(.*split|Image\.memory\(" mobile/lib/widgets` -> only the centralized `DataUrlImage` remains.
- `cd mobile && flutter analyze` / `flutter test` / Android build -> unavailable because the container has no Flutter SDK.
