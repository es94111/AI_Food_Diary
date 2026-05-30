import { NextResponse } from "next/server";
import { APK_URL, APP_RELEASE_NOTES, LATEST_APP_VERSION, WEB_VERSION } from "@/lib/version";

// Public endpoint so the mobile app can check for updates before/after login.
export async function GET() {
  return NextResponse.json({
    webVersion: WEB_VERSION,
    latestVersion: LATEST_APP_VERSION,
    apkUrl: APK_URL,
    releaseNotes: APP_RELEASE_NOTES
  });
}
