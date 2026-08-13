# Android E2E tests (Maestro)

UI automation flows for the AI Food Diary Android app, run against a debug
build talking to the real production backend (`https://aifood.shao.one`) with
a dedicated test account.

## One-time setup

1. **Android emulator or device.** An AVD named `food_diary_a16` already
   exists locally. Any emulator/device works — get its id from
   `adb devices` or `maestro` will use whichever is connected.
2. **`.maestro/.env`** (already present, gitignored, never commit it):
   ```
   TEST_EMAIL=<test account email>
   TEST_PASSWORD=<test account password>
   QA_BYPASS_TOKEN=<shared secret — see below>
   ```
3. **Backend Turnstile bypass must be deployed and configured.** The
   production login page normally shows a real Cloudflare Turnstile
   challenge, which these flows cannot and will not solve. Instead, the
   backend (`src/lib/turnstile.ts`) swaps in Cloudflare's official
   always-pass test widget for requests carrying header
   `x-qa-bypass-token: <QA_BYPASS_TOKEN>`. For this to work in production:
   - The backend change touching `src/lib/turnstile.ts`,
     `src/app/login/page.tsx`, and `src/app/api/auth/login/route.ts` must be
     deployed.
   - The deployment must have env var `TURNSTILE_QA_BYPASS_TOKEN` set to the
     same value as `QA_BYPASS_TOKEN` in `.maestro/.env`.
   - Optionally set `TURNSTILE_QA_BYPASS_EMAILS=<test account email>` so a
     leaked token can only ever be used to sign in as the test account, not
     for credential stuffing.
   - `TURNSTILE_TEST_SITE_KEY` / `TURNSTILE_TEST_SECRET_KEY` are optional —
     they default to Cloudflare's publicly documented always-pass keypair.

   Without this, `flows/login.yaml` will time out waiting for
   `✅ 已完成人機驗證` — the real challenge is still being served.

## Building the test APK

The bypass header is only sent when the app is built with the
`QA_BYPASS_TOKEN` dart-define, so the distributed release APK never carries
it. Build a debug APK with the token from `.maestro/.env` baked in:

```bash
flutter build apk --debug --dart-define=QA_BYPASS_TOKEN=<value from .maestro/.env>
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

## Running the flows

```bash
maestro test .maestro/flows/smoke_dashboard_nav.yaml
maestro test .maestro/flows/add_manual_meal.yaml
maestro test .maestro/flows/saved_foods_nav.yaml

# or the whole directory, tagged "smoke":
maestro test .maestro/flows --include-tags smoke
```

Maestro automatically loads `.maestro/.env` for flows run from this
directory, so `${TEST_EMAIL}` / `${TEST_PASSWORD}` resolve without extra
flags.

## What's covered

| Flow | Covers |
|---|---|
| `login.yaml` | Reusable subflow: fill credentials, clear the (bypassed) Turnstile widget, submit, wait for the dashboard. Not runnable standalone (no `launchApp`). |
| `logout.yaml` | Reusable subflow: Settings tab → 登出 → back at the login screen. |
| `smoke_dashboard_nav.yaml` | Login, confirm all three bottom-nav tabs (飲食/健康/設定) render, logout. |
| `add_manual_meal.yaml` | Login, add one food item via 手動 (manual) entry mode, confirm the AI-analysis round trip and save, assert it shows up in the meal list, then deletes it so the test account's diary stays empty across runs. |
| `saved_foods_nav.yaml` | Login, open 我的食物管理 from Settings, confirm it loads, navigate back. |

**Not covered / deliberately out of scope:**
- Registration (`register.yaml` doesn't exist) — it would create a real user
  in the production database on every run. Add it later if you want that,
  reusing the same Turnstile bypass.
- Photo-capture and text-description meal modes — both call a real AI
  vision/text model per run, which is slow and costs money on every test
  run. Manual mode exercises the same save/list/delete path without the AI
  call.
- Google Sign-In — not automatable without a real Google account and
  consent flow.
- CI integration — these flows need a booted Android emulator and are not
  currently wired into GitHub Actions. Ask before adding that (emulator CI
  jobs are slow and cost minutes).

## Troubleshooting

- **`Device server died ... UNAVAILABLE`** from a long-lived Maestro
  session: restart `adb` (`adb kill-server && adb start-server`) and re-run;
  if it persists, `maestro test` from a fresh terminal works around a stale
  driver connection.
- Selectors are text-based (Traditional Chinese UI strings), copied from a
  live `adb shell uiautomator dump` / Maestro `inspect_screen`, not guessed.
  If the UI copy changes, flows will fail on the exact string — update the
  flow to match, don't loosen the selector to a partial match (Maestro's
  `text:` matcher requires a full-string regex).
