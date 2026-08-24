import '../config.dart';
import 'api_client.dart';

/// Resolves the public Turnstile site key used by the mobile login challenge.
/// The key is public, so the app may safely read it from the public version
/// endpoint and fall back to the build-time default during config drift.
class TurnstileService {
  static final _api = ApiClient.instance;
  static final _siteKeyPattern = RegExp(r'^[A-Za-z0-9_-]{10,128}$');

  static String? _cached;
  static bool _checked = false;

  static Future<String?> siteKey({bool force = false}) async {
    if (_checked && !force) return _cached;

    String? resolved;
    try {
      final res = await _api.get('/api/app/version');
      final data = res.data;
      final key = data is Map ? data['turnstileSiteKey'] : null;
      if (key is String && _siteKeyPattern.hasMatch(key.trim())) {
        resolved = key.trim();
      }
    } catch (_) {
      // The fallback still lets the widget render when only the public config
      // endpoint is temporarily unavailable.
    }

    final fallback = turnstileSiteKey.trim();
    _cached = resolved ??
        (_siteKeyPattern.hasMatch(fallback) ? fallback : null);
    _checked = true;
    return _cached;
  }
}
