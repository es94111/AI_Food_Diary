import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// On-disk cache for GET responses, keyed by endpoint (+query).
///
/// Cached payloads are meal/health/profile data, so this is backed by
/// [FlutterSecureStorage] (Android Keystore-backed EncryptedSharedPreferences
/// / iOS Keychain) rather than plain SharedPreferences — same encrypted store
/// already used for the session cookie and Health Connect sync token — so the
/// cache is encrypted at rest, not just sandboxed. Entries survive app
/// restarts, not just process memory — this is what lets the dashboard paint
/// instantly with the last-known data on cold start instead of blocking on
/// the network every time the app opens. [ApiClient] writes through to this
/// cache on every successful `cache: true` GET and falls back to it when
/// offline.
class CacheService {
  CacheService._();
  static const _prefix = 'api_cache_';
  static const _storage = FlutterSecureStorage();

  static Future<dynamic> read(String key) async {
    final raw = await _storage.read(key: '$_prefix$key');
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  static Future<void> write(String key, dynamic data) async {
    try {
      await _storage.write(key: '$_prefix$key', value: jsonEncode(data));
    } catch (_) {
      // Payload isn't JSON-encodable (shouldn't happen for a decoded API
      // response) — just skip caching this one.
    }
  }

  /// Clears every cached response. Called on logout so the next signed-in
  /// user never briefly sees a previous account's cached data. Only removes
  /// `api_cache_`-prefixed entries, so it never touches the session cookie or
  /// Health Connect token that share the same secure store.
  static Future<void> clearAll() async {
    final all = await _storage.readAll();
    for (final key in all.keys.where((k) => k.startsWith(_prefix))) {
      await _storage.delete(key: key);
    }
  }
}
