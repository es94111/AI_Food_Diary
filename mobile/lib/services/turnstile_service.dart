import 'api_client.dart';

/// Reads the public Cloudflare Turnstile site key from the live web `/login`
/// page so the mobile app never has to hardcode it. Returns null when the
/// backend has Turnstile disabled (the widget isn't rendered).
class TurnstileService {
  static final _api = ApiClient.instance;
  static final _siteKeyRe = RegExp(r'data-sitekey="([^"]+)"');

  static String? _cached;
  static bool _checked = false;

  static Future<String?> siteKey({bool force = false}) async {
    if (_checked && !force) return _cached;
    try {
      final res = await _api.get('/login');
      final html = res.data is String ? res.data as String : '';
      final match = _siteKeyRe.firstMatch(html);
      _cached = match?.group(1);
    } catch (_) {
      _cached = null;
    }
    _checked = true;
    return _cached;
  }
}
