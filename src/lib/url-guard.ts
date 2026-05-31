import "server-only";
import { HttpError } from "@/lib/http";

// SSRF guard for the user-supplied OpenAI-compatible base URL. A logged-in user
// could otherwise point the server at internal services or cloud metadata
// (e.g. http://169.254.169.254). We require https and reject private/reserved
// hosts. Note: this validates the literal hostname only; a public hostname that
// *resolves* to a private IP (DNS rebinding) is not caught here — defense in
// depth would require resolving at request time.

function ipv4ToParts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "");

  // Hostnames that are inherently internal.
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;

  // IPv6 loopback / unspecified / unique-local (fc00::/7) / link-local (fe80::/10).
  if (host === "::1" || host === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254)
  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) {
    const parts = ipv4ToParts(mapped[1]);
    return parts ? isPrivateIpv4(parts) : true;
  }

  const ipv4 = ipv4ToParts(host);
  if (ipv4) return isPrivateIpv4(ipv4);

  return false;
}

// Throws HttpError(400) when the base URL is unsafe; otherwise returns the
// trimmed value.
export function assertSafeCompatibleBaseUrl(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Invalid base URL", "Base URL 格式不正確。");
  }
  if (url.protocol !== "https:") {
    throw new HttpError(400, "Insecure base URL", "Base URL 必須使用 https://。");
  }
  if (isBlockedHost(url.hostname)) {
    throw new HttpError(400, "Blocked base URL host", "Base URL 不可指向內網或保留位址。");
  }
  return value;
}
