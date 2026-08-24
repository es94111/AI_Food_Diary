# Android E2E tests (Maestro)

UI automation flows for the AI Food Diary Android app, run against a debug
build talking to the real production backend (`https://aifood.shao.one`).
Authentication is Google SSO only: the test device must already have a
dedicated Google test account configured.

## One-time setup

1. **Android emulator or device.** An AVD named `food_diary_a16` already
   exists locally. Any emulator/device works — get its id from `adb devices`
   or `maestro` will use whichever is connected.
2. Configure the backend `GOOGLE_CLIENT_ID` and the matching mobile/web client
   id. The debug APK can alternatively resolve the client id from
   `/api/app/version` at runtime.
3. Sign the emulator/device into a dedicated Google test account. Do not use a
   personal account in production-data flows.
4. Confirm the deployment has `TURNSTILE_SECRET` and a production-only
   `TURNSTILE_HOSTNAMES` value. Complete the Turnstile widget manually on the
   login screen before starting a flow.

## Building the test APK

The login screen requires a real Cloudflare Turnstile challenge. There is no
password or QA bypass; solve the widget manually on the test device before
Maestro taps the Google button. Build and install a normal debug APK:

```bash
flutter build apk --debug
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

Maestro runs `flows/login.yaml` as a reusable Google SSO subflow. Native account
selection/consent UI is provider-controlled and may require a one-time manual
setup on a fresh emulator.

## What's covered

| Flow | Covers |
| --- | --- |
| `login.yaml` | Reusable Google SSO subflow; not runnable standalone (no `launchApp`). |
| `logout.yaml` | Settings tab → 登出 → back at the Google SSO login screen. |
| `smoke_dashboard_nav.yaml` | Google SSO login, confirm all three bottom-nav tabs (飲食/健康/設定) render, logout. |
| `add_manual_meal.yaml` | Google SSO login, add one food item via 手動 (manual) entry mode, confirm the AI-analysis round trip and save, assert it shows up in the meal list, then deletes it so the test account's diary stays empty across runs. |
| `saved_foods_nav.yaml` | Google SSO login, open 我的食物管理 from Settings, confirm it loads, navigate back. |

**Not covered / deliberately out of scope:**

- Local password login or registration — removed by policy; legacy API endpoints
  return 410 and no password is accepted.
- Photo-capture and text-description meal modes — both call a real AI
  vision/text model per run, which is slow and costs money on every test run.
- Google provider integration details — token verification and account policy
  still require backend integration tests; Maestro only exercises the client
  handoff.
- CI integration — these flows need a booted Android emulator and are not
  currently wired into GitHub Actions. Ask before adding that (emulator CI
  jobs are slow and cost minutes).

## Troubleshooting

- **`Device server died ... UNAVAILABLE`** from a long-lived Maestro session:
  restart `adb` (`adb kill-server && adb start-server`) and re-run; if it
  persists, `maestro test` from a fresh terminal works around a stale driver
  connection.
- If `使用 Google 登入` is not visible, check that `/api/app/version` returns
  `googleClientId` and that the APK uses the matching OAuth web client id.
- Selectors are text-based (Traditional Chinese UI strings), copied from a
  live `adb shell uiautomator dump` / Maestro `inspect_screen`, not guessed.
  If the UI copy changes, flows will fail on the exact string — update the
  flow to match, don't loosen the selector to a partial match (Maestro's
  `text:` matcher requires a full-string regex).
