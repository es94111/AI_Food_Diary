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
