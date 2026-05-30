import 'package:google_sign_in/google_sign_in.dart';

import '../config.dart';
import '../models/models.dart';
import 'api_client.dart';
import 'auth_service.dart';

/// Native Google Sign-In → backend ID-token verification → cookie session.
class GoogleAuth {
  static bool get isConfigured => googleServerClientId.isNotEmpty;

  static final GoogleSignIn _gsi = GoogleSignIn(
    // The web client id, so the issued ID token's audience matches the backend.
    serverClientId: googleServerClientId,
    scopes: const ['email', 'profile'],
  );

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

  /// Sign out of Google so the account chooser shows next time.
  static Future<void> signOut() async {
    try {
      await _gsi.signOut();
    } catch (_) {}
  }
}
