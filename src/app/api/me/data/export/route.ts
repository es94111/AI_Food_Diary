import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiRoute, isCrossSiteNavigation } from "@/lib/http";
import { ExportTooLargeError } from "@/lib/export-images";
import { buildUserDataExport } from "@/lib/user-data-export";
import { encodeWarnings } from "@/lib/nouriledger-handoff";
import { enforceUserDataExportRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const handler = apiRoute(async (request: Request) => {
  if (isCrossSiteNavigation(request)) {
    return NextResponse.json({ error: "請從設定頁面操作資料匯出。" }, { status: 403 });
  }

  const user = await requireUser();
  const limited = await enforceUserDataExportRateLimit(user.id);
  if (limited) return limited;

  try {
    const result = await buildUserDataExport(user.id);
    const stamp = result.exportedAt.slice(0, 10);
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-food-diary-my-data-${stamp}.json"`,
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff"
    });
    if (result.warnings.length) headers.set("X-Data-Export-Warnings", encodeWarnings(result.warnings));
    return new NextResponse(result.json, { status: 200, headers });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return NextResponse.json({ error: "匯出檔案過大，無法使用既有匯入流程。" }, { status: 413 });
    }
    console.error("User data export failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "資料匯出失敗，請稍後再試。" }, { status: 500 });
  }
});

export const GET = async (request: Request) => {
  const response = await handler(request);
  response.headers.set("Cache-Control", "no-store, no-transform");
  return response;
};
