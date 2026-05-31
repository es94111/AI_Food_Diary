import "server-only";

// Best-effort client IP for rate-limiting and Turnstile. Cloudflare sets
// cf-connecting-ip; otherwise we take the first hop of x-forwarded-for.
export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

// Verifies a Cloudflare Turnstile token. When TURNSTILE_SECRET_KEY is unset the
// challenge is considered disabled and always passes (dev / self-host without
// Turnstile). When it is set, a missing or invalid token fails.
export async function verifyTurnstile(token?: string, remoteIp?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
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
