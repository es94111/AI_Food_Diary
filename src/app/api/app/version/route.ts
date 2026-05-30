import { NextResponse } from "next/server";
import { getLatestAppRelease } from "@/lib/app-release";
import { WEB_VERSION } from "@/lib/version";

// Public endpoint so the mobile app can check for updates before/after login.
// Version + notes are resolved dynamically from S3 (downloads/ and notes/).
export async function GET(request: Request) {
  const release = await getLatestAppRelease();
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    webVersion: WEB_VERSION,
    latestVersion: release.version || WEB_VERSION,
    apkUrl: release.apkKey ? `${origin}/api/app/download` : (process.env.APP_APK_URL ?? ""),
    releaseNotes: release.notes
  });
}
