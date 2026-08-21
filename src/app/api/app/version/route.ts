import { NextResponse } from "next/server";
import { getLatestAppRelease } from "@/lib/app-release";
import { WEB_VERSION } from "@/lib/version";

// Public endpoint so the mobile app can check for updates before/after login.
// Version + notes are resolved dynamically from S3 (downloads/ and notes/).
let warnedMissingPublicUrl = false;
export async function GET(request: Request) {
  const release = await getLatestAppRelease();
  const origin = publicOrigin(request);
  return NextResponse.json(
    {
      webVersion: WEB_VERSION,
      latestVersion: release.version || WEB_VERSION,
      apkUrl: release.apkKey ? `${origin}/api/app/download` : (process.env.APP_APK_URL ?? ""),
      releaseNotes: release.notes,
      // The Google web client id (same one the backend verifies tokens against),
      // so the app can enable Google sign-in at runtime without baking the id in
      // at build time. Empty when Google sign-in isn't configured.
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""
    },
    // The origin may be derived from Host headers; tell shared caches to vary
    // on it so one client's forged Host can't poison another's cached apkUrl.
    { headers: { Vary: "Host" } }
  );
}

// Behind a reverse proxy `request.url` is the internal address (e.g.
// http://localhost:<port>), which would hand the app an unreachable download
// URL. Prefer an explicit public URL, then the proxy's forwarded host headers,
// and only fall back to the request origin.
function publicOrigin(request: Request): string {
  const configured = process.env.APP_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  // Host-derived origins are spoofable by the client; if a path-keyed shared
  // cache sits in front of this endpoint, that enables cache poisoning of the
  // APK download URL. Production deployments must set APP_PUBLIC_URL.
  if (process.env.NODE_ENV === "production" && !warnedMissingPublicUrl) {
    warnedMissingPublicUrl = true;
    console.warn(
      "[app/version] APP_PUBLIC_URL is not set — apkUrl is derived from request Host headers. " +
        "Set APP_PUBLIC_URL in production to prevent host-header cache poisoning."
    );
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
