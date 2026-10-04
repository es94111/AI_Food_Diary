import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/http";
import { summarizeUser } from "@/lib/nouriledger-export";
import { resolveGrant } from "@/lib/nouriledger-grant";

export const dynamic = "force-dynamic";

// Server-to-server: who the code belongs to and how much data there is, for NouriLedger's confirmation page.
// Does not consume the code.
export const POST = apiRoute(async (request: Request) => {
  const grant = await resolveGrant(request, { consume: false, scope: "userinfo", userLimit: { limit: 20, windowSec: 600 } });
  if (!grant.ok) return grant.response;
  const summary = await summarizeUser(grant.userId);
  if (!summary) return NextResponse.json({ error: "invalid_grant" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
});
