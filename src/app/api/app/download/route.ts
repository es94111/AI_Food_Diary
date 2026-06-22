import { NextResponse } from "next/server";
import { getLatestAppRelease } from "@/lib/app-release";
import { getObject } from "@/lib/storage";

// Streams the latest APK from the S3 `downloads/` folder. Public so the app
// (and the web download link) can fetch it without auth.
export async function GET() {
  const release = await getLatestAppRelease();
  if (!release.apkKey) {
    return NextResponse.json({ error: "目前沒有可用的 App 版本" }, { status: 404 });
  }

  const obj = await getObject(release.apkKey);
  if (!obj.Body) {
    return NextResponse.json({ error: "找不到安裝檔" }, { status: 404 });
  }

  const filename = release.apkKey.split("/").pop() ?? `ai-food-${release.version}.apk`;
  return new Response(obj.Body.transformToWebStream(), {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...(obj.ContentLength != null ? { "Content-Length": String(obj.ContentLength) } : {}),
      "Cache-Control": "public, max-age=300"
    }
  });
}
