import "server-only";
import { timingSafeEqual } from "node:crypto";

// Best-effort client IP for rate-limiting and Turnstile. Cloudflare sets
// cf-connecting-ip; otherwise we take the first hop of x-forwarded-for.
export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

// Cloudflare's publicly documented "always passes" Turnstile test keypair
// (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
// Not a secret — Cloudflare intends these to be shared for exactly this
// purpose — so they're safe to hardcode as the default.
const TURNSTILE_ALWAYS_PASS_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_ALWAYS_PASS_SECRET_KEY = "1x0000000000000000000000000000000AA";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Lets local QA automation (Maestro) clear Turnstile without weakening it for
// real traffic. Requires the caller to present the exact shared secret in
// TURNSTILE_QA_BYPASS_TOKEN via the x-qa-bypass-token header; that token only
// ever lives in a local, gitignored .env and is compiled into test-only debug
// APK builds via a dart-define, never into the distributed release build. If
// TURNSTILE_QA_BYPASS_TOKEN is unset (the default), this always returns false
// and production behaves exactly as before.
export function isQaBypassToken(provided: string | null | undefined): boolean {
  const expected = process.env.TURNSTILE_QA_BYPASS_TOKEN;
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

export function isQaBypassRequest(request: Request): boolean {
  return isQaBypassToken(request.headers.get("x-qa-bypass-token"));
}

// Extra blast-radius limit: even with a valid bypass token, only allow the
// pre-approved test account(s) to skip Turnstile, so a leaked token can't be
// used to credential-stuff arbitrary accounts. Unset TURNSTILE_QA_BYPASS_EMAILS
// (comma-separated) to allow any email — set it in production once a test
// account is designated.
export function isQaBypassEmailAllowed(email: string): boolean {
  const allowlist = process.env.TURNSTILE_QA_BYPASS_EMAILS;
  if (!allowlist) return true;
  const normalized = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .includes(normalized);
}

// Site key to render on the login/register page. Swaps in Cloudflare's
// always-pass test key when the request carries a valid QA bypass token, so
// Maestro can complete the widget without solving a real challenge. Real
// visitors always get the production key.
export function resolveTurnstileSiteKey(bypassToken: string | null | undefined): string | undefined {
  if (isQaBypassToken(bypassToken)) {
    return process.env.TURNSTILE_TEST_SITE_KEY || TURNSTILE_ALWAYS_PASS_SITE_KEY;
  }
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

// Verifies a Cloudflare Turnstile token. When TURNSTILE_SECRET_KEY is unset the
// challenge is considered disabled and always passes (dev / self-host without
// Turnstile). When it is set, a missing or invalid token fails. Pass
// [useQaTestSecret] (only after checking isQaBypassRequest + isQaBypassEmailAllowed)
// to verify against Cloudflare's test secret instead of the real one.
export async function verifyTurnstile(
  token?: string,
  remoteIp?: string | null,
  useQaTestSecret = false
): Promise<boolean> {
  const secret = useQaTestSecret
    ? process.env.TURNSTILE_TEST_SECRET_KEY || TURNSTILE_ALWAYS_PASS_SECRET_KEY
    : process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.success === true;
}
