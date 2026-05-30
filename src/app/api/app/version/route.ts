import { NextResponse } from "next/server";
import { getLatestAppRelease } from "@/lib/app-release";
import { WEB_VERSION } from "@/lib/version";

// Public endpoint so the mobile app can check for updates before/after login.
// Version + notes are resolved dynamically from S3 (downloads/ and notes/).
export async function GET(request: Request) {
  const release = await getLatestAppRelease();
  return NextResponse.json({
    webVersion: WEB_VERSION,
    latestVersion: release.version || WEB_VERSION,
    apkUrl: release.apkKey ? `${publicOrigin(request)}/api/app/download` : (process.env.APP_APK_URL ?? ""),
    releaseNotes: release.notes,
    // The Google web client id (same one the backend verifies tokens against),
    // so the app can enable Google sign-in at runtime without baking the id in
    // at build time. Empty when Google sign-in isn't configured.
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""
  });
}

// Behind a reverse proxy `request.url` is the internal address (e.g.
// http://localhost:<port>), which would hand the app an unreachable download
// URL. Prefer an explicit public URL, then the proxy's forwarded host headers,
// and only fall back to the request origin.
function publicOrigin(request: Request): string {
  const configured = process.env.APP_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
