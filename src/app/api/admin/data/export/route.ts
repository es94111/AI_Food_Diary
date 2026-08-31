import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiRoute, isCrossSiteNavigation } from "@/lib/http";
import { buildExportEnvelope } from "@/lib/admin-export";
import { enforceAdminDataExportRateLimit } from "@/lib/rate-limit";

// Admin full-database export (decrypted). The response body contains every
// user's data in plaintext (including AI API keys), so it is always an
// attachment download with no-store — never cacheable, never inline.
export const GET = apiRoute(async (request: Request) => {
  // SameSite=Lax rides along on cross-site top-level navigations; a hostile
  // link must not trigger a full-database decrypt on visit.
  if (isCrossSiteNavigation(request)) {
    return NextResponse.json({ error: "請從管理頁面操作匯出。" }, { status: 403 });
  }
  const admin = await requireAdmin();
  const limited = await enforceAdminDataExportRateLimit(admin.id);
  if (limited) return limited;

  const envelope = await buildExportEnvelope();
  const stamp = envelope.exportedAt.slice(0, 10);

  return new NextResponse(JSON.stringify(envelope, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-food-diary-export-${stamp}.json"`,
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff"
    }
  });
});