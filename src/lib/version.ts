import pkg from "../../package.json";

/// The deployed web app version (from package.json).
export const WEB_VERSION: string = pkg.version;

// The latest Android app version, APK and release notes are resolved
// dynamically from S3 (downloads/ and notes/) — see lib/app-release.ts.
