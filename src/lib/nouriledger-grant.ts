import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getNouriLedgerOrigin, HandoffError, markCodeUsed, redeemGrant } from "@/lib/nouriledger-handoff";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export type GrantResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

/**
 * Shared gate of the two server-to-server endpoints. Order matters: nothing is spent (rate budget, code) before the
 * request is proven genuine, and the one-time code is only burned once every other check has passed.
 */
export async function resolveGrant(
  request: Request,
  options: { consume: boolean; scope: string; userLimit: { limit: number; windowSec: number } }
): Promise<GrantResult> {
  const origin = getNouriLedgerOrigin();
  if (!origin) return { ok: false, response: fail("not_found", 404) };

  // Coarse bucket for unauthenticated garbage; behind an untrusted proxy every caller shares it by design.
  const blocked = await enforceRateLimit(`nouriledger-handoff:ip:${getClientIp(request) ?? "shared"}`, { limit: 300, windowSec: 600 });
  if (blocked) return { ok: false, response: blocked };

  let body: unknown = null;
  try { body = await request.json(); } catch { /* reported as invalid_request below */ }
  let payload;
  try {
    payload = redeemGrant(body, origin, { consume: false });
  } catch (error) {
    if (error instanceof HandoffError) return { ok: false, response: fail(error.code, 400) };
    throw error;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.uid }, select: { id: true, isDisabled: true, tokenVersion: true } });
  if (!user || user.isDisabled || user.tokenVersion !== payload.tv) return { ok: false, response: fail("invalid_grant", 400) };

  const limited = await enforceRateLimit(`nouriledger-handoff:${options.scope}:${user.id}`, options.userLimit);
  if (limited) return { ok: false, response: limited };

  if (options.consume && !markCodeUsed(payload)) return { ok: false, response: fail("invalid_grant", 400) };
  return { ok: true, userId: user.id };
}
