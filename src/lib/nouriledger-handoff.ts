import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// One-click hand-off of a user's own data to NouriLedger (the merged successor app).
//
// Flow (OAuth authorization-code with PKCE; this app is the authorization + resource server):
//   1. NouriLedger sends the browser to /api/migration/nouriledger/authorize with its state and a
//      PKCE S256 challenge. The signed-in user gets a short-lived code bound to that challenge.
//   2. NouriLedger's *server* calls /userinfo (identity + counts, code stays valid) and /export (the
//      data, code is consumed) with the code and the PKCE verifier. The verifier never reaches the
//      browser, so a code leaked from a URL is useless.
//
// The feature is off unless NOURILEDGER_ORIGIN is set to a valid origin. No database state is kept:
// the code is a stateless HMAC token; single use is enforced in memory (the verifier requirement
// and the 10 minute lifetime are what bound a replay after a restart).

type Env = Readonly<Record<string, string | undefined>>;

export const HANDOFF_CALLBACK_PATH = "/migrate/callback";
export const HANDOFF_AUTHORIZE_PATH = "/api/migration/nouriledger/authorize";
/** Long enough for a person to read the confirmation page on NouriLedger. */
export const CODE_TTL_SECONDS = 600;

const CODE_PREFIX = "nlh1";
export const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/u;
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/u;
export const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/u;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

/** Bare origin of `value`, or null. HTTPS always; plain HTTP only for loopback (local development). */
export function normalizeOrigin(value: string): string | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  if (url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname))) return url.origin;
  return null;
}

let warnedFor: string | null = null;

/** The NouriLedger instance users may hand data to; null switches the whole feature off. */
export function getNouriLedgerOrigin(env: Env = process.env): string | null {
  const raw = (env.NOURILEDGER_ORIGIN ?? "").trim();
  if (!raw) return null;
  const origin = normalizeOrigin(raw);
  if (!origin && warnedFor !== raw) {
    warnedFor = raw;
    console.warn("[nouriledger-import] NOURILEDGER_ORIGIN is not a valid HTTPS origin; the one-click import stays disabled.");
  }
  return origin;
}

export type HandoffErrorCode = "invalid_request" | "invalid_grant";

export class HandoffError extends Error {
  readonly code: HandoffErrorCode;
  constructor(code: HandoffErrorCode) {
    super(code);
    this.name = "HandoffError";
    this.code = code;
  }
}

export interface CodePayload {
  v: 1;
  /** Account the code was issued to. */
  uid: string;
  /** tokenVersion at issue time: "sign out of all devices" invalidates outstanding codes. */
  tv: number;
  /** PKCE S256 challenge the redeemer must prove knowledge of. */
  cc: string;
  /** Expiry, seconds since epoch. */
  exp: number;
  jti: string;
  /** NouriLedger origin the code is meant for. */
  aud: string;
}

function signingKey(env: Env): Buffer {
  const secret = env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  return createHmac("sha256", secret).update("nouriledger-import:v1").digest();
}

function sign(body: string, env: Env): string {
  return createHmac("sha256", signingKey(env)).update(body).digest("base64url");
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface IssueOptions { now?: number; env?: Env }

export function issueAuthorizationCode(input: { userId: string; tokenVersion: number; codeChallenge: string; audience: string }, options: IssueOptions = {}): string {
  const payload: CodePayload = {
    v: 1, uid: input.userId, tv: input.tokenVersion, cc: input.codeChallenge,
    exp: Math.floor((options.now ?? Date.now()) / 1000) + CODE_TTL_SECONDS, jti: randomBytes(16).toString("base64url"), aud: input.audience,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${CODE_PREFIX}.${body}.${sign(body, options.env ?? process.env)}`;
}

/** Checks signature, expiry, audience and the PKCE proof. Every failure is the same opaque `invalid_grant`. */
export function verifyAuthorizationCode(code: string, input: { verifier: string; audience: string }, options: IssueOptions = {}): CodePayload {
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) throw new HandoffError("invalid_grant");
  const [, body, signature] = parts;
  if (!sameString(signature, sign(body, options.env ?? process.env))) throw new HandoffError("invalid_grant");
  let payload: Partial<CodePayload>;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<CodePayload>; } catch { throw new HandoffError("invalid_grant"); }
  if (payload.v !== 1 || typeof payload.uid !== "string" || !payload.uid || !Number.isInteger(payload.tv) || typeof payload.cc !== "string"
    || !Number.isInteger(payload.exp) || typeof payload.jti !== "string" || typeof payload.aud !== "string") throw new HandoffError("invalid_grant");
  if ((payload.exp as number) <= Math.floor((options.now ?? Date.now()) / 1000)) throw new HandoffError("invalid_grant");
  if (!sameString(payload.aud, input.audience)) throw new HandoffError("invalid_grant");
  if (!sameString(payload.cc, pkceChallenge(input.verifier))) throw new HandoffError("invalid_grant");
  return payload as CodePayload;
}

// Single-use bookkeeping. globalThis keeps it across dev-server module reloads.
const globalStore = globalThis as unknown as { __nouriLedgerUsedCodes?: Map<string, number> };
const usedCodes = (globalStore.__nouriLedgerUsedCodes ??= new Map<string, number>());

function pruneUsed(now: number): void {
  for (const [jti, expiresAt] of usedCodes) if (expiresAt <= now) usedCodes.delete(jti);
}

export function isCodeUsed(payload: CodePayload, now: number = Date.now()): boolean {
  pruneUsed(now);
  return usedCodes.has(payload.jti);
}

/** Returns false when the code was already redeemed. */
export function markCodeUsed(payload: CodePayload, now: number = Date.now()): boolean {
  pruneUsed(now);
  if (usedCodes.has(payload.jti)) return false;
  usedCodes.set(payload.jti, payload.exp * 1000);
  return true;
}

export const grantBodySchema = z.strictObject({
  code: z.string().min(20).max(4096),
  code_verifier: z.string().regex(VERIFIER_RE),
  redirect_uri: z.string().max(300),
});

/**
 * Validates a server-to-server request. `consume: true` redeems the code (export); `false` only checks it (userinfo).
 * A code that has already been redeemed is dead for both.
 */
export function redeemGrant(body: unknown, origin: string, options: IssueOptions & { consume: boolean }): CodePayload {
  const parsed = grantBodySchema.safeParse(body);
  if (!parsed.success) throw new HandoffError("invalid_request");
  if (parsed.data.redirect_uri !== `${origin}${HANDOFF_CALLBACK_PATH}`) throw new HandoffError("invalid_grant");
  const payload = verifyAuthorizationCode(parsed.data.code, { verifier: parsed.data.code_verifier, audience: origin }, options);
  const now = options.now ?? Date.now();
  if (options.consume ? !markCodeUsed(payload, now) : isCodeUsed(payload, now)) throw new HandoffError("invalid_grant");
  return payload;
}

export type AuthorizeDecision =
  | { kind: "reject"; status: number; error: string }
  | { kind: "login" }
  | { kind: "redirect"; location: string };

/**
 * Decides what the browser-facing authorize endpoint does. `reject` is used whenever the redirect target cannot be
 * trusted (we never bounce an error to a URL we did not configure); everything else goes back to NouriLedger.
 */
export function decideAuthorize(url: URL, session: { userId: string; tokenVersion: number } | null, origin: string | null, options: IssueOptions = {}): AuthorizeDecision {
  if (!origin) return { kind: "reject", status: 404, error: "not_found" };
  const query = url.searchParams;
  const redirectUri = `${origin}${HANDOFF_CALLBACK_PATH}`;
  if (query.get("redirect_uri") !== redirectUri) return { kind: "reject", status: 400, error: "invalid_redirect_uri" };
  const state = query.get("state") ?? "";
  if (!STATE_RE.test(state)) return { kind: "reject", status: 400, error: "invalid_request" };
  const challenge = query.get("code_challenge") ?? "";
  if (query.get("response_type") !== "code" || query.get("code_challenge_method") !== "S256" || !CHALLENGE_RE.test(challenge)) {
    return { kind: "redirect", location: `${redirectUri}?${new URLSearchParams({ error: "invalid_request", state })}` };
  }
  if (!session) return { kind: "login" };
  const code = issueAuthorizationCode({ userId: session.userId, tokenVersion: session.tokenVersion, codeChallenge: challenge, audience: origin }, options);
  return { kind: "redirect", location: `${redirectUri}?${new URLSearchParams({ code, state })}` };
}

/** The small base64url JSON header NouriLedger reads for non-fatal export notes. Kept well under its 4 KB limit. */
export function encodeWarnings(warnings: string[]): string {
  return Buffer.from(JSON.stringify(warnings.slice(0, 5).map((warning) => warning.slice(0, 160)))).toString("base64url");
}
