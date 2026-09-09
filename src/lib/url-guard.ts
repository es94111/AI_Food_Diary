import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import { HttpError } from "@/lib/http";

// SSRF guard for the user-supplied OpenAI-compatible base URL. A logged-in user
// could otherwise point the server at internal services or cloud metadata
// (e.g. http://169.254.169.254). We require https and reject private/reserved
// hosts. Outbound requests also resolve the hostname immediately before opening
// a socket and pin that socket to the validated public address. That closes the
// DNS-rebinding gap between a standalone lookup and the actual connection.

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
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function ipv6ToBytes(host: string): number[] | null {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.includes("%")) return null; // zone identifiers are not valid public URLs
  const sections = normalized.split("::");
  if (sections.length > 2) return null;

  const parseSection = (section: string): number[] | null => {
    if (!section) return [];
    const parts = section.split(":");
    const result: number[] = [];
    for (const part of parts) {
      if (part.includes(".")) {
        const ipv4 = ipv4ToParts(part);
        if (!ipv4 || result.length !== parts.length - 1) return null;
        result.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
        result.push(Number.parseInt(part, 16));
      }
    }
    return result;
  };

  const left = parseSection(sections[0]);
  const right = parseSection(sections[1] ?? "");
  if (!left || !right) return null;
  const hextets = sections.length === 1
    ? left
    : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  if (hextets.length !== 8) return null;
  return hextets.flatMap((value) => [value >> 8, value & 0xff]);
}

function isBlockedIpv6(host: string): boolean {
  const bytes = ipv6ToBytes(host);
  if (!bytes) return true;
  const first10Zero = bytes.slice(0, 10).every((value) => value === 0);
  const first12Zero = bytes.slice(0, 12).every((value) => value === 0);
  if (first10Zero && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIpv4(bytes.slice(12));
  }
  if (first12Zero) return true; // unspecified, loopback, or IPv4-compatible
  if (bytes[0] === 0xff) return true; // multicast
  if ((bytes[0] & 0xfe) === 0xfc) return true; // unique-local fc00::/7
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return true; // deprecated site-local
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // documentation
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x02) return true; // benchmarking
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x10) return true; // orchid
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return true; // 6to4 can embed private IPv4 ranges
  return false;
}

export function isBlockedHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "");

  // Hostnames that are inherently internal.
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;

  const ipv4 = ipv4ToParts(host);
  if (ipv4) return isPrivateIpv4(ipv4);
  if (isIP(host) === 6) return isBlockedIpv6(host);

  return false;
}

type PublicAddress = { address: string; family: 4 | 6 };
type PinnedConnector = ReturnType<typeof buildConnector>;

const OUTBOUND_CONNECT_TIMEOUT_MS = 10_000;
const OUTBOUND_BODY_TIMEOUT_MS = 90_000;

async function resolvePublicAddress(hostname: string): Promise<PublicAddress> {
  const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const literalFamily = isIP(normalizedHost);
  if (literalFamily === 4 || literalFamily === 6) {
    if (isBlockedHost(normalizedHost)) throw new Error("Unsafe outbound host");
    return { address: normalizedHost, family: literalFamily };
  }
  if (isBlockedHost(normalizedHost)) throw new Error("Unsafe outbound host");

  const addresses = await lookup(normalizedHost, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedHost(address))
  ) {
    throw new Error("Unsafe outbound host");
  }
  const address = addresses.find(({ family }) => family === 4 || family === 6);
  if (!address) throw new Error("Unsafe outbound host");
  return { address: address.address, family: address.family as 4 | 6 };
}

function createPinnedAgent(hostname: string): Agent {
  const connect = buildConnector({
    allowH2: false,
    maxCachedSessions: 0,
    timeout: OUTBOUND_CONNECT_TIMEOUT_MS
  });
  const pinnedConnector: PinnedConnector = (options, callback) => {
    void resolvePublicAddress(hostname).then(
      ({ address }) =>
        connect(
          {
            ...options,
            hostname: address,
            host: address,
            // Keep the original hostname for TLS SNI and certificate checks.
            servername: hostname
          },
          callback
        ),
      (error) => callback(error instanceof Error ? error : new Error("Unsafe outbound host"), null)
    );
  };

  // One request per agent prevents an unvalidated pooled connection from being
  // reused after DNS changes. The short keep-alive timeout also bounds idle
  // sockets because fetch responses are consumed by their caller.
  return new Agent({
    connect: pinnedConnector,
    connections: 1,
    maxOrigins: 1,
    maxRequestsPerClient: 1,
    allowH2: false,
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 1_000,
    headersTimeout: OUTBOUND_BODY_TIMEOUT_MS,
    bodyTimeout: OUTBOUND_BODY_TIMEOUT_MS
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input);
  return new URL(input.url);
}

// Server-side fetch for arbitrary HTTPS destinations. DNS is resolved inside
// the connector that opens the socket, and the validated address is used as the
// TCP/TLS host while the original hostname remains the TLS server name.
export async function fetchWithPinnedPublicAddress(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = requestUrl(input);
  if (url.protocol !== "https:" || isBlockedHost(url.hostname)) {
    throw new Error("Unsafe outbound URL");
  }

  const dispatcher = createPinnedAgent(url.hostname);
  try {
    return (await undiciFetch(input as never, {
      ...init,
      redirect: "error",
      dispatcher
    } as never)) as unknown as Response;
  } catch (error) {
    await dispatcher.destroy(error instanceof Error ? error : null);
    throw error;
  }
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
