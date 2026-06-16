import 'package:google_sign_in/google_sign_in.dart';

import '../config.dart';
import '../models/models.dart';
import 'api_client.dart';
import 'auth_service.dart';

/// Native Google Sign-In → backend ID-token verification → cookie session.
class GoogleAuth {
  // The Google web client id. Defaults to the build-time dart-define, but is
  // overridden at runtime by [ensureConfigured] using the value the backend
  // reports — so a CI build with an empty GOOGLE_SERVER_CLIENT_ID secret still
  // shows the button once the app talks to the server.
  static String _clientId = googleServerClientId;
  static final GoogleSignIn _gsi = GoogleSignIn.instance;

  // Tracks whether `initialize()` has been called (and completed) for the
  // current [_clientId]. The plugin requires `initialize` to be awaited
  // exactly once before any other method is used, and re-initializing is
  // needed if the server client id changes after the first call (see
  // [ensureConfigured]).
  static Future<void>? _initFuture;

  static bool get isConfigured => _clientId.isNotEmpty;

  /// Ensures `GoogleSignIn.instance.initialize(...)` has been called (and
  /// awaited) with the current [_clientId] before any other plugin method is
  /// used. Safe to call repeatedly; re-initializes only if the resolved
  /// client id changed since the last call.
  static Future<void> _ensureInitialized() {
    return _initFuture ??= _gsi.initialize(serverClientId: _clientId);
  }

  /// Ensures a Google web client id is available, fetching it from the backend
  /// (`/api/app/version`) when not provided at build time. Returns whether
  /// Google sign-in is configured. Safe to call repeatedly.
  static Future<bool> ensureConfigured() async {
    if (isConfigured) return true;
    try {
      final res = await ApiClient.instance.get('/api/app/version');
      final id = res.data is Map ? res.data['googleClientId'] as String? : null;
      if (id != null && id.isNotEmpty) {
        _clientId = id;
        _initFuture = null; // re-initialize with the resolved id on next use
      }
    } catch (_) {
      // Offline / endpoint unavailable — leave unconfigured; button stays hidden.
    }
    return isConfigured;
  }

  /// Returns the logged-in user, or null if the user cancelled.
  static Future<AppUser?> signIn() async {
    final idToken = await _authenticateAndGetIdToken();
    if (idToken == null) return null; // cancelled
    return AuthService.loginWithGoogle(idToken);
  }

  /// Runs Google sign-in and returns just the ID token (for account linking),
  /// or null if the user cancelled.
  static Future<String?> getIdToken() => _authenticateAndGetIdToken();

  /// Runs the interactive Google authentication flow and returns the ID
  /// token, or null if the user cancelled the flow.
  ///
  /// google_sign_in 7.x's `authenticate()` throws a [GoogleSignInException]
  /// with code `canceled` instead of returning null on cancellation (unlike
  /// the old `signIn()`). That exception is caught here and translated back
  /// to a null return so callers keep their pre-existing "null = cancelled"
  /// contract.
  static Future<String?> _authenticateAndGetIdToken() async {
    await _ensureInitialized();
    GoogleSignInAccount account;
    try {
      account = await _gsi.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      rethrow;
    }
    final idToken = account.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw ApiException('無法取得 Google 憑證，請重試。');
    }
    return idToken;
  }

  /// Sign out of Google so the account chooser shows next time.
  static Future<void> signOut() async {
    try {
      await _ensureInitialized();
      await _gsi.signOut();
    } catch (_) {}
  }
}
