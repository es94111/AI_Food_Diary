import pkg from "../../package.json";

/// The deployed web app version (from package.json).
export const WEB_VERSION: string = pkg.version;

/// The latest released Android app version + download. Configured via env so a
/// new release just needs these updated (no code change). Example:
///   APP_LATEST_VERSION=1.1.0
///   APP_APK_URL=https://aifood.shao.one/downloads/ai-food-1.1.0.apk
///   APP_RELEASE_NOTES=修正同步問題、新增血壓
export const LATEST_APP_VERSION: string = process.env.APP_LATEST_VERSION ?? WEB_VERSION;
export const APK_URL: string = process.env.APP_APK_URL ?? "";
export const APP_RELEASE_NOTES: string = process.env.APP_RELEASE_NOTES ?? "";
