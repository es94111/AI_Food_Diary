import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// On-disk cache for GET responses, keyed by endpoint (+query).
///
/// Backed by SharedPreferences so entries survive app restarts, not just
/// process memory — this is what lets the dashboard paint instantly with the
/// last-known data on cold start instead of blocking on the network every
/// time the app opens. [ApiClient] writes through to this cache on every
/// successful `cache: true` GET and falls back to it when offline.
class CacheService {
  CacheService._();
  static const _prefix = 'api_cache_';

  static Future<dynamic> read(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_prefix$key');
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  static Future<void> write(String key, dynamic data) async {
    final prefs = await SharedPreferences.getInstance();
    try {
      await prefs.setString('$_prefix$key', jsonEncode(data));
    } catch (_) {
      // Payload isn't JSON-encodable (shouldn't happen for a decoded API
      // response) — just skip caching this one.
    }
  }

  /// Clears every cached response. Called on logout so the next signed-in
  /// user never briefly sees a previous account's cached data.
  static Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    for (final key in prefs.getKeys().where((k) => k.startsWith(_prefix))) {
      await prefs.remove(key);
    }
  }
}
