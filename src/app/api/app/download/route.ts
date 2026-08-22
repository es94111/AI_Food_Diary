import { NextResponse } from "next/server";
import { getLatestAppRelease } from "@/lib/app-release";
import { getObject } from "@/lib/storage";

// Streams the latest APK from the S3 `downloads/` folder. Public so the app
// (and the web download link) can fetch it without auth. Range requests are
// forwarded so Android can resume a partial download after a lifecycle change.
export async function GET(request: Request) {
  const release = await getLatestAppRelease();
  if (!release.apkKey) {
    return NextResponse.json({ error: "目前沒有可用的 App 版本" }, { status: 404 });
  }

  const range = request.headers.get("range");
  const requestedRange = range && /^bytes=\d+-\d*$/.test(range) ? range : undefined;
  const obj = await getObject(release.apkKey, requestedRange);
  if (!obj.Body) {
    return NextResponse.json({ error: "找不到安裝檔" }, { status: 404 });
  }

  const filename = release.apkKey.split("/").pop() ?? `ai-food-${release.version}.apk`;
  const headers = new Headers({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=300"
  });
  if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));
  if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);

  return new Response(obj.Body.transformToWebStream(), {
    status: obj.ContentRange ? 206 : 200,
    headers
  });
}
