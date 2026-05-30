/// Build-time configuration.
///
/// The Google **Web** OAuth client id (same one the backend verifies against
/// and the web app uses). Pass it at build/run time, e.g.:
///   flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
/// When empty, the Google sign-in button is hidden.
const String googleServerClientId =
    String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID', defaultValue: '');
