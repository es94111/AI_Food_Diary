import 'package:sentry_flutter/sentry_flutter.dart';

import '../models/models.dart';
import '../utils/metabolism.dart';
import 'api_client.dart';
import 'image_cache_service.dart';

class MealService {
  static final _api = ApiClient.instance;

  /// Meals for a single local day (date = yyyy-MM-dd).
  static Future<List<Meal>> mealsForDay(DateTime day) async {
    final res = await _api.get('/api/meals',
        query: {'date': isoDate(day), 'tzOffset': '${localTzOffsetMinutes()}'},
        cache: true);
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法載入餐點'));
    }
    final list = res.data['meals'] as List? ?? [];
    return list.map((e) => Meal.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Last cached meals for [day] from a previous [mealsForDay] call, or an
  /// empty list if none cached yet. Lets the dashboard paint instantly on
  /// open instead of waiting on the network.
  static Future<List<Meal>> cachedMealsForDay(DateTime day) async {
    final data = await _api.cached('/api/meals',
        query: {'date': isoDate(day), 'tzOffset': '${localTzOffsetMinutes()}'});
    if (data is! Map<String, dynamic>) return [];
    final list = data['meals'] as List? ?? [];
    try {
      return list.map((e) => Meal.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Meals across a 7-day week starting at [weekStart] (one request per day,
  /// since the web `/api/meals` endpoint is day-scoped).
  static Future<List<Meal>> mealsForWeek(DateTime weekStart) async {
    final results = await Future.wait(
      List.generate(7, (i) => mealsForDay(weekStart.add(Duration(days: i)))),
    );
    return results.expand((e) => e).toList();
  }

  // ---- AI analysis (returns items to confirm, does NOT persist) ----

  static Future<List<FoodAnalysisItem>> analyzeImage(
      String mealType, List<String> imageDataUrls,
      {bool precise = false}) {
    return _analyze('/api/meals/analyze', {
      'mealType': mealType,
      'imageDataUrls': imageDataUrls,
      'precise': precise,
      'eatenAt': DateTime.now().toUtc().toIso8601String(),
    }, '分析失敗，請稍後再試');
  }

  static Future<List<FoodAnalysisItem>> analyzeDescription(
      String mealType, String description) {
    return _analyze('/api/meals/analyze-description', {
      'mealType': mealType,
      'description': description,
      'eatenAt': DateTime.now().toUtc().toIso8601String(),
    }, '分析失敗，請稍後再試');
  }

  static Future<List<FoodAnalysisItem>> analyzeManual(
      String mealType, List<MealItem> items) {
    return _analyze('/api/meals/analyze-manual', {
      'mealType': mealType,
      'manualItems': items.map((e) => e.toPayload()).toList(),
      'eatenAt': DateTime.now().toUtc().toIso8601String(),
    }, 'AI 評分失敗，請稍後再試');
  }

  /// Re-estimates nutrition for user-corrected items. Recomputes calories and
  /// macros from the edited name + amount (not the original photo), so fixing a
  /// food name refreshes the whole estimate.
  static Future<List<FoodAnalysisItem>> reestimate(
      String mealType, List<MealItem> items) {
    return _analyze('/api/meals/reestimate', {
      'mealType': mealType,
      'manualItems': items.map((e) => e.toPayload()).toList(),
      'eatenAt': DateTime.now().toUtc().toIso8601String(),
    }, '重新 AI 辨識失敗，請稍後再試');
  }

  static Future<List<FoodAnalysisItem>> analyzeNutritionLabel(
      List<String> imageDataUrls) {
    return _analyze('/api/meals/analyze-nutrition-label', {
      'imageDataUrls': imageDataUrls,
    }, '營養標示分析失敗，請稍後再試');
  }

  /// Brand + item-name search for a product's public nutrition label, judged
  /// by AI into up to 5 candidates (FR-004). Does not persist — the caller
  /// saves a selected/edited candidate via SavedFoodService.create().
  static Future<List<BrandSearchCandidate>> analyzeBrandSearch(
      String brand, String itemName) async {
    final transaction =
        Sentry.startTransaction('meal.analyze', 'ai.run', bindToScope: true);
    transaction.setData('endpoint', '/api/foods/brand-search');
    try {
      final res = await _api.post('/api/foods/brand-search', data: {
        'brand': brand,
        'itemName': itemName,
      });
      if (!ApiClient.ok(res)) {
        transaction.status = SpanStatus.internalError();
        Sentry.logger.error('Brand search failed', attributes: {
          'status': SentryAttribute.int(res.statusCode ?? 0),
        });
        throw ApiException(
            ApiClient.errorMessage(res, '品牌搜尋失敗，請稍後再試'),
            statusCode: res.statusCode);
      }
      final candidates = res.data['candidates'] as List? ?? [];
      transaction.status = SpanStatus.ok();
      return candidates
          .map((e) => BrandSearchCandidate.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      transaction.throwable = e;
      transaction.status ??= SpanStatus.internalError();
      rethrow;
    } finally {
      await transaction.finish();
    }
  }

  static Future<List<FoodAnalysisItem>> _analyze(
      String path, Map<String, dynamic> body, String fallback) async {
    // Root trace for an AI analysis on the app side. bindToScope makes it the
    // active transaction, so the Dio HTTP span and the distributed-tracing
    // headers attach to it — and the backend's server-side LLM (gen_ai) spans
    // continue this same trace, giving an end-to-end view (app -> API -> LLM).
    final transaction =
        Sentry.startTransaction('meal.analyze', 'ai.run', bindToScope: true);
    transaction.setData('endpoint', path);
    try {
      final res = await _api.post(path, data: body);
      if (!ApiClient.ok(res)) {
        transaction.status = SpanStatus.internalError();
        Sentry.logger.error('Meal analysis failed', attributes: {
          'path': SentryAttribute.string(path),
          'status': SentryAttribute.int(res.statusCode ?? 0),
        });
        throw ApiException(ApiClient.errorMessage(res, fallback),
            statusCode: res.statusCode);
      }
      final foods = res.data['analysis']?['foods'] as List? ?? [];
      transaction.status = SpanStatus.ok();
      return foods
          .map((e) => FoodAnalysisItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      transaction.throwable = e;
      transaction.status ??= SpanStatus.internalError();
      rethrow;
    } finally {
      await transaction.finish();
    }
  }

  // ---- persistence ----

  static Future<void> createMeal({
    required String mealType,
    List<String>? imageDataUrls,
    List<String>? savedFoodImageIds,
    String? description,
    required List<MealItem> items,
  }) async {
    final res = await _api.post('/api/meals', data: {
      'mealType': mealType,
      if (imageDataUrls != null && imageDataUrls.isNotEmpty)
        'imageDataUrls': imageDataUrls,
      // Photos from picked saved foods, attached by reference (no re-upload/copy).
      if (savedFoodImageIds != null && savedFoodImageIds.isNotEmpty)
        'savedFoodImageIds': savedFoodImageIds,
      if (description != null && description.isNotEmpty) 'description': description,
      'manualItems': items.map((e) => e.toPayload()).toList(),
      'eatenAt': DateTime.now().toUtc().toIso8601String(),
    });
    if (!ApiClient.ok(res)) {
      Sentry.logger.error('Meal save failed', attributes: {
        'meal_type': SentryAttribute.string(mealType),
        'status': SentryAttribute.int(res.statusCode ?? 0),
      });
      throw ApiException(ApiClient.errorMessage(res, '儲存失敗，請稍後再試'),
          statusCode: res.statusCode);
    }
    // Count each successfully logged meal, tagged by meal type for breakdown.
    Sentry.metrics.count(
      'meals_created',
      1,
      attributes: {'meal_type': SentryAttribute.string(mealType)},
    );
  }

  static Future<void> updateMeal(
      String id, String mealType, List<MealItem> items) async {
    final res = await _api.patch('/api/meals/$id', data: {
      'mealType': mealType,
      'items': items.map((e) => e.toPayload()).toList(),
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '更新失敗，請稍後再試'),
          statusCode: res.statusCode);
    }
  }

  static Future<void> deleteMeal(String id) async {
    final res = await _api.delete('/api/meals/$id');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '刪除失敗，請稍後再試'));
    }
  }

  /// Upper bound on photos per meal (matches the backend's upload limit), used
  /// only to bound image-cache eviction after a removal — safe to over-evict.
  static const maxImages = 5;

  /// Retroactively attaches photos to an existing meal (e.g. one logged via the
  /// describe/manual flow without a photo), or adds more to its current set.
  static Future<void> addImages(String id, List<String> imageDataUrls) async {
    final res = await _api.post('/api/meals/$id/image', data: {
      'imageDataUrls': imageDataUrls,
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '照片上傳失敗'),
          statusCode: res.statusCode);
    }
  }

  /// Removes a single photo from a meal by its (0-based) index. Removing an
  /// image shifts every later photo's index down by one, so their cached URLs
  /// (`.../image?i=N`) would otherwise serve the wrong photo from disk — evict
  /// the affected indices so the next render re-downloads the correct ones.
  static Future<void> removeImage(String id, int index) async {
    final res = await _api.delete('/api/meals/$id/image?i=$index');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '移除照片失敗'));
    }
    await Future.wait(
      List.generate(
        maxImages,
        (i) => ImageCacheService.evict(_mealImageUrl(id, i)),
      ),
    );
  }

  // ---- AI summary & recommendation ----

  /// Daily summary. With [generate] false (default) it only returns an already
  /// stored summary (null if none), spending no AI quota; with true it
  /// generates one if missing.
  static Future<DailySummary?> dailySummary(DateTime day,
      {bool generate = false}) async {
    final res = await _api.get('/api/daily-summary', query: {
      'date': isoDate(day),
      'tzOffset': '${localTzOffsetMinutes()}',
      if (generate) 'generate': '1',
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法產生今日總結'));
    }
    final summary = res.data['summary'];
    if (summary == null) return null;
    return DailySummary.fromJson(summary as Map<String, dynamic>);
  }

  /// Regenerates and returns today's next-meal advice (spends AI quota).
  /// Sends the device's local date so the recommendation is keyed to the
  /// user's day, not the server's timezone.
  static Future<String> nextMealAdvice() async {
    final res = await _api.get('/api/recommendations/next-meal',
        query: {'date': isoDate(DateTime.now()), 'tzOffset': '${localTzOffsetMinutes()}'});
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法產生下一餐建議'));
    }
    return (res.data['advice'] as String?) ?? '';
  }

  /// Returns today's stored next-meal advice without regenerating ('' if none).
  static Future<String> peekNextMealAdvice() async {
    final res = await _api.get('/api/recommendations/next-meal',
        query: {'peek': '1', 'date': isoDate(DateTime.now()), 'tzOffset': '${localTzOffsetMinutes()}'});
    if (!ApiClient.ok(res)) return '';
    return (res.data['advice'] as String?) ?? '';
  }

  /// Absolute URL for a meal image (the API returns a relative path).
  static String imageUrl(String storageKeyPath) =>
      '${ApiClient.baseUrl}$storageKeyPath';

  /// Meal images are protected by the backend and should be loaded through the
  /// authenticated image endpoint, not directly from the object-storage key.
  /// [index] selects which image of the batch (0-based).
  static String mealImageUrl(Meal meal, [int index = 0]) =>
      _mealImageUrl(meal.id, index);

  static String _mealImageUrl(String id, int index) =>
      '${ApiClient.baseUrl}/api/meals/$id/image?i=$index';
}
