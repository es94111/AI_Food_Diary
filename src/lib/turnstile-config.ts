// Turnstile site keys are public and safe to expose to the browser.
// Keep the supplied widget as the safe default so a deployment does not
// silently render an unprotected login page when the public env is omitted.
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
  "0x4AAAAAADYFeQGVNASty2ls";

export const TURNSTILE_LOGIN_ACTION = "login";
