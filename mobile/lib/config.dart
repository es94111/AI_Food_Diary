/// Build-time configuration.
///
/// The Google **Web** OAuth client id (same one the backend verifies against
/// and the web app uses). Pass it at build/run time, e.g.:
///   flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
/// When empty, the Google sign-in button is hidden.
const String googleServerClientId =
    String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID', defaultValue: '');

// Public Cloudflare Turnstile site key. The app normally resolves this from
// /api/app/version so deployments can rotate the public binding without a new
// APK; this fallback keeps the login challenge available during config drift.
const String turnstileSiteKey = String.fromEnvironment(
  'TURNSTILE_SITE_KEY',
  defaultValue: '0x4AAAAAADYFeQGVNASty2ls',
);
