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
  static GoogleSignIn? _gsiInstance;

  static bool get isConfigured => _clientId.isNotEmpty;

  static GoogleSignIn get _gsi => _gsiInstance ??= GoogleSignIn(
        // The web client id, so the ID token's audience matches the backend.
        serverClientId: _clientId,
        scopes: const ['email', 'profile'],
      );

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
        _gsiInstance = null; // rebuild with the resolved id on next use
      }
    } catch (_) {
      // Offline / endpoint unavailable — leave unconfigured; button stays hidden.
    }
    return isConfigured;
  }

  /// Returns the logged-in user, or null if the user cancelled.
  static Future<AppUser?> signIn() async {
    final account = await _gsi.signIn();
    if (account == null) return null; // cancelled
    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw ApiException('無法取得 Google 憑證，請重試。');
    }
    return AuthService.loginWithGoogle(idToken);
  }

  /// Runs Google sign-in and returns just the ID token (for account linking),
  /// or null if the user cancelled.
  static Future<String?> getIdToken() async {
    final account = await _gsi.signIn();
    if (account == null) return null;
    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw ApiException('無法取得 Google 憑證，請重試。');
    }
    return idToken;
  }

  /// Sign out of Google so the account chooser shows next time.
  static Future<void> signOut() async {
    try {
      await _gsi.signOut();
    } catch (_) {}
  }
}
