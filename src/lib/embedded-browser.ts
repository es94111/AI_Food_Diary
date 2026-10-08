/**
 * Detects requests coming from an embedded in-app browser (a WebView hosted
 * inside another native app, e.g. the ChatGPT mobile app rendering our OAuth
 * `/login` page to connect the MCP connector).
 *
 * Google Identity Services ("Sign in with Google") explicitly refuses to run
 * inside these WebViews and fails with `disallowed_useragent`:
 * https://developers.google.com/identity/gsi/web/guides/supported-browsers
 *
 * This has no effect on this project's own Flutter app, which authenticates
 * with the native `google_sign_in` SDK and never renders this web login page
 * in a WebView (see mobile/lib/services/google_auth.dart).
 */

const KNOWN_IN_APP_BROWSER_MARKERS = [
  "FBAN",
  "FBAV",
  "FB_IAB", // Facebook
  "Instagram",
  "Line/", // LINE
  "MicroMessenger", // WeChat
  "Twitter",
  "TikTok",
  "musical_ly",
  "Snapchat",
  "Pinterest/",
] as const;

// Real third-party browsers on iOS are still WebKit-based but carry their own
// product token; excluding them keeps the WKWebView heuristic below from
// flagging genuine browsers as embedded.
const OTHER_IOS_BROWSER_MARKERS = [
  "CriOS", // Chrome
  "FxiOS", // Firefox
  "EdgiOS", // Edge
  "OPiOS", // Opera
  "DuckDuckGo",
  "UCBrowser",
] as const;

export function isEmbeddedWebViewUserAgent(
  userAgent: string | null | undefined,
): boolean {
  if (!userAgent) return false;

  if (KNOWN_IN_APP_BROWSER_MARKERS.some((marker) => userAgent.includes(marker))) {
    return true;
  }

  // Chromium's Android WebView appends a literal "; wv)" token that no real
  // browser (including Chrome for Android itself) sends.
  if (/;\s*wv\)/i.test(userAgent)) return true;

  // A genuine iOS Safari user agent always carries both "Version/<n>" and
  // "Safari/<n>". A plain WKWebView-based in-app browser reports some subset
  // of "Mobile/<build>" and "Safari/<n>" but never the "Version/" token that
  // only Safari.app itself adds. Other real iOS browsers (Chrome, Firefox,
  // Edge, ...) carry their own product token instead, so they're excluded
  // first to avoid false positives.
  const isIos = /iPhone|iPad|iPod/.test(userAgent);
  if (isIos && !OTHER_IOS_BROWSER_MARKERS.some((marker) => userAgent.includes(marker))) {
    const isRealSafari = /Version\//.test(userAgent) && /Safari\//.test(userAgent);
    if (!isRealSafari) return true;
  }

  return false;
}
