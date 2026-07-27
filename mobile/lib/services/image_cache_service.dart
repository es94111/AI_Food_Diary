import 'package:flutter_cache_manager/flutter_cache_manager.dart';

import 'api_client.dart';

/// Dedicated on-disk cache for authenticated network images (saved-food
/// thumbnails, meal photos), so frequently-shown pictures don't re-download
/// on every app open. Isolated under its own [Config.cacheKey] so it can be
/// cleared on logout without affecting other caches, and so a previous
/// account's photos are never served to the next signed-in user.
class FoodImageCacheManager extends CacheManager {
  FoodImageCacheManager._()
      : super(Config(
          'foodImageCache',
          stalePeriod: const Duration(days: 30),
          maxNrOfCacheObjects: 200,
        ));
  static final instance = FoodImageCacheManager._();
}

/// Helpers around the on-disk image cache: auth-header construction, eviction
/// when an image is re-uploaded/removed, and full clear on logout.
class ImageCacheService {
  ImageCacheService._();

  /// Cookie header for authenticated image endpoints. Returns an empty map
  /// (rather than null) when no session is held, matching the pre-existing
  /// `_authHeaders()` pattern at the call sites.
  static Map<String, String> authHeaders() {
    final cookie = ApiClient.instance.sessionCookie;
    return cookie == null ? const {} : {'Cookie': cookie};
  }

  /// Drops the cached file for [url] (if any) so a re-download picks up a
  /// freshly uploaded/replaced image. Call after a saved-food or meal image
  /// is updated or removed.
  static Future<void> evict(String url) async {
    try {
      await FoodImageCacheManager.instance.removeFile(url);
    } catch (_) {
      // File not present / already evicted — nothing to do.
    }
  }

  /// Clears every cached image. Called from [ApiClient.clearSession] on
  /// logout so the next signed-in user never sees a previous account's
  /// cached photos.
  static Future<void> clearAll() async {
    try {
      await FoodImageCacheManager.instance.emptyCache();
    } catch (_) {
      // Best-effort; cache dir may already be gone on a fresh install.
    }
  }
}