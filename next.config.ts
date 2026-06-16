import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. We allow the third parties the app actually loads:
// Google Fonts (styles + font files), Cloudflare Turnstile (script + widget
// iframe), and Google Identity Services (sign-in script + iframe). 'unsafe-inline'
// is kept for scripts/styles because Next.js injects inline bootstrap without a
// nonce; 'unsafe-eval' is dev-only (HMR). object-src/base-uri/frame-ancestors are
// locked down to blunt injection and clickjacking.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com https://www.gstatic.com",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://accounts.google.com https://apis.google.com https://www.gstatic.com`,
  "connect-src 'self' https://challenges.cloudflare.com https://accounts.google.com https://o4511575169040384.ingest.de.sentry.io",
  "frame-src https://challenges.cloudflare.com https://accounts.google.com"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // HSTS only meaningfully applies over HTTPS in production.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }])
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default withSentryConfig(nextConfig, {
  org: "shao-wq",
  project: "ai-food-diary-web",
  // Only print source-map upload logs in CI.
  silent: !process.env.CI,
  // Upload a wider set of client source maps for readable stack traces.
  widenClientFileUpload: true,
  // Tree-shake Sentry logger statements to shrink the client bundle.
  disableLogger: true,
  // Source-map upload needs SENTRY_AUTH_TOKEN at build time; without it the
  // build still succeeds, just without uploaded maps.
});

