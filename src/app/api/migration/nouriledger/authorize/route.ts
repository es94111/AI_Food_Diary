import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { decideAuthorize, getNouriLedgerOrigin } from "@/lib/nouriledger-handoff";

export const dynamic = "force-dynamic";

function redirectTo(location: string) {
  return new NextResponse(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

// Browser endpoint of the one-click hand-off to NouriLedger. A signed-in user is sent straight back to NouriLedger
// with a short-lived code; nobody else gets anything. The data itself only moves later, server to server, after the
// user confirms on NouriLedger.
export const GET = apiRoute(async (request: Request) => {
  const url = new URL(request.url);
  const origin = getNouriLedgerOrigin();
  const user = origin ? await getCurrentUser() : null;
  // getCurrentUser() hides tokenVersion on purpose; the code needs it so "sign out everywhere" revokes it.
  const account = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { tokenVersion: true } }) : null;
  const decision = decideAuthorize(url, user && account ? { userId: user.id, tokenVersion: account.tokenVersion } : null, origin);
  if (decision.kind === "reject") return NextResponse.json({ error: decision.error }, { status: decision.status, headers: { "Cache-Control": "no-store" } });
  if (decision.kind === "login") return redirectTo(`/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
  return redirectTo(decision.location);
});
