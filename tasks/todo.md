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

---

# 2026-07-28 trivy-container-scan-78

## Goal + Acceptance Criteria
- [x] Restate goal: diagnose GitHub Actions `Trivy (container scan)` run #78 and prepare the smallest safe fix.
- [x] Capture the exact failing job, vulnerability, installed version, and fixed version from Actions logs.
- [x] Implement a fix that removes `CVE-2026-14257` from the production container without weakening the Trivy gate.
- [x] Add or adjust regression coverage for the production image contents.
- [x] Verify the Docker image builds and the same HIGH/CRITICAL Trivy scan passes.
- [x] Re-run the GitHub Actions workflow and confirm it succeeds.
- [x] Summarize changes, rollback, and residual risk.

## Risk & Rollback
- Risk level: medium (production container dependency/tooling change).
- Affected components: `Dockerfile`, production image contents, Trivy container scan.
- Rollback strategy: `git revert 6f9eedf` to remove only the focused container dependency change if build/runtime verification regresses.
- Rollout plan: validate locally, push the focused change to the affected branch, then re-run the same workflow.
- Monitoring signal: Trivy reports zero HIGH/CRITICAL findings and the container health check/runtime smoke test remains healthy.

## Dependencies & Environment
- Affected workflow: `.github/workflows/trivy.yml`.
- Failed run: `https://github.com/es94111/AI_Food_Diary/actions/runs/30324079967`.
- Failed branch/SHA: `release/v0.66.1` at `cbea4e8b6fc5f9d8a6ec9ce3bf6d9b2cb994491e`.
- Local GitHub CLI credential is expired; public GitHub API and connected GitHub Actions tooling remain available for read-only diagnosis.

## Checklist
- [x] Review repo task notes and working tree.
- [x] Inspect run #78 job and full Trivy output.
- [x] Locate why `brace-expansion@5.0.7` remains in the final image.
- [x] Propose the focused fix and obtain implementation approval per CI-fix workflow.
- [x] Implement the smallest safe slice.
- [x] Run targeted build/container/Trivy verification.
- [x] Perform correctness and security review.
- [x] Update Results and Verification below.

## Working Notes
- Run #78 completed on 2026-07-28 with only `Run Trivy vulnerability scan` failing.
- Exact finding: `brace-expansion@5.0.7`, `CVE-2026-14257`, HIGH, fixed in `5.0.8`.
- The scan found one HIGH and zero CRITICAL vulnerabilities; the action correctly exited with code 1.
- The failed image was built successfully before scanning, so the failure is a real image-content finding rather than a Buildx or Trivy setup error.
- The app dependency tree already resolves `brace-expansion@5.0.8`; the vulnerable copy is bundled inside global `npm@12.0.1` under `/usr/local/lib/node_modules/npm`.
- npm 12.0.1 is the latest stable release as of 2026-07-28, so the fix replaces only npm's bundled package from the registry tarball and asserts its installed version during the Docker build.
- The package tarball SHA-512 is pinned to the integrity already recorded in `package-lock.json`; the build also executes the patched expansion function plus `npm` and `npx` smoke checks.

## Results
- `Dockerfile` now replaces npm's bundled `brace-expansion@5.0.7` with exactly `5.0.8`.
- The build fails loudly if the tarball integrity, expected npm internal version, expansion behavior, or npm/npx smoke checks fail.
- Trivy policy and `.trivyignore` are unchanged.
- Fix commit `6f9eedf` was pushed to `release/v0.66.1`.
- GitHub Actions run #79 completed successfully on the fix commit; the final image reported zero security findings at the configured HIGH/CRITICAL gate.
- Independent correctness and security reviews found no blocking issue after adding the SHA-512 verification.

## Verification
- GitHub Actions job `Build & scan image` (job `90165702843`) → build passed, Trivy failed on `CVE-2026-14257`.
- `npm view npm version` → `12.0.1` (no newer stable npm available).
- `npm ls brace-expansion --all` → app dependency copies resolve to `5.0.8`.
- `npm pack brace-expansion@5.0.8` + local extraction → package version `5.0.8`; archive SHA-512 matches the committed integrity.
- Local package functional smoke → `5.0.8 a,b`.
- `git diff --check` → passed.
- Local Docker build/scan was unavailable because Docker Desktop was not running.
- GitHub Actions run `https://github.com/es94111/AI_Food_Diary/actions/runs/30325658459` at `6f9eedf`:
  - `Build image (load locally)` → passed, including `/tmp/brace-expansion-5.0.8.tgz: OK` and Dockerfile assertions.
  - `Run Trivy vulnerability scan` → passed; log reports `0: Clean (no security findings detected)`.
  - Overall `Build & scan image` job → success.
