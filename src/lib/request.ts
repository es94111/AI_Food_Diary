import "server-only";

// Return a proxy-provided client IP only when the deployment explicitly trusts
// its edge proxy to overwrite these headers. Direct clients can forge both
// headers, so the secure default is null and callers must use a shared fallback
// rate-limit bucket for untrusted requests.
export function getClientIp(request: Request): string | null {
  if (process.env.TRUSTED_PROXY_HEADERS !== "true") return null;

  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const hops = forwarded
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.at(-1) ?? null;
}
