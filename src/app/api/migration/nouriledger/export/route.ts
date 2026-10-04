import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/http";
import { buildNouriLedgerPackage, ExportTooLargeError } from "@/lib/nouriledger-export";
import { resolveGrant } from "@/lib/nouriledger-grant";
import { encodeWarnings } from "@/lib/nouriledger-handoff";

export const dynamic = "force-dynamic";

// Server-to-server: the signed-in user's own data (and nothing else) for NouriLedger. Consumes the one-time code.
// The body contains decrypted personal data, so it is never cacheable.
export const POST = apiRoute(async (request: Request) => {
  const grant = await resolveGrant(request, { consume: true, scope: "export", userLimit: { limit: 5, windowSec: 600 } });
  if (!grant.ok) return grant.response;
  try {
    const result = await buildNouriLedgerPackage(grant.userId);
    const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (result.warnings.length) headers.set("X-Nouriledger-Export-Warnings", encodeWarnings(result.warnings));
    // A FormData body makes Response set the multipart Content-Type (with boundary) itself.
    return new Response(result.form, { status: 200, headers });
  } catch (error) {
    if (error instanceof ExportTooLargeError) return NextResponse.json({ error: "too_large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    console.error("NouriLedger export failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
});
