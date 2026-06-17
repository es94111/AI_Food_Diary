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
  // Sentry Session Replay compresses payloads in a blob-backed Web Worker.
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com https://accounts.google.com"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Required for Sentry browser profiling (JS Self-Profiling API).
  { key: "Document-Policy", value: "js-profiling" },
  // HSTS only meaningfully applies over HTTPS in production.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }])
];

const nextConfig: NextConfig = {
  // @sentry/profiling-node ships native bindings; keep it out of the server
  // bundle so Next.js loads it from node_modules at runtime.
  serverExternalPackages: ["@sentry/profiling-node"],
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
  release: {
    // Pin the release name so the maps uploaded here, the runtime SDK, and the
    // CI commit-association step all reference the SAME release. In CI this is
    // the app version (see docker-image.yml); locally it's undefined and the
    // plugin falls back to auto-detecting from git.
    name: process.env.SENTRY_RELEASE || undefined,
    // Commits are associated in a separate CI step (getsentry/action-release)
    // because the Docker build context excludes .git. Leave the release
    // unfinalized here so that step can set commits and then finalize it.
    finalize: false,
  },
});

