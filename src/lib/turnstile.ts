import "server-only";

type SiteverifyResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
};

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function expectedHostnames(): Set<string> {
  return new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Verify a single-use Turnstile token on the server before an auth action.
 *
 * This intentionally fails closed when the secret or hostname allowlist is
 * missing. The browser only supplies the token; Cloudflare remains the source
 * of truth for success, action, and hostname.
 */
export async function verifyTurnstile(
  token: unknown,
  expectedAction: string,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  const hostnames = expectedHostnames();

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048 ||
    !secret ||
    !expectedAction ||
    hostnames.size === 0
  ) {
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as SiteverifyResult;
    if (
      result.success !== true ||
      result.action !== expectedAction ||
      typeof result.hostname !== "string"
    ) {
      return false;
    }

    return hostnames.has(result.hostname.trim().toLowerCase());
  } catch {
    // Treat Cloudflare/network failures as a rejected challenge rather than
    // allowing an auth request to continue without verification.
    return false;
  }
}
