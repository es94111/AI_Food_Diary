import '../models/models.dart';
import '../utils/metabolism.dart';
import 'api_client.dart';

class MealService {
  static final _api = ApiClient.instance;

  /// Meals for a single local day (date = yyyy-MM-dd).
  static Future<List<Meal>> mealsForDay(DateTime day) async {
    final res = await _api.get('/api/meals',
        query: {'date': isoDate(day), 'tzOffset': '${localTzOffsetMinutes()}'});
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法載入餐點'));
    }
    final list = res.data['meals'] as List? ?? [];
    return list.map((e) => Meal.fromJson(e as Map<String, dynamic>)).toList();
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
      String mealType, String imageDataUrl) {
    return _analyze('/api/meals/analyze', {
      'mealType': mealType,
      'imageDataUrl': imageDataUrl,
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

  static Future<List<FoodAnalysisItem>> analyzeNutritionLabel(
      String imageDataUrl) {
    return _analyze('/api/meals/analyze-nutrition-label', {
      'imageDataUrl': imageDataUrl,
    }, '營養標示分析失敗，請稍後再試');
  }

  static Future<List<FoodAnalysisItem>> _analyze(
      String path, Map<String, dynamic> body, String fallback) async {
    final res = await _api.post(path, data: body);
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, fallback),
          statusCode: res.statusCode);
    }
    final foods = res.data['analysis']?['foods'] as List? ?? [];
    return foods
        .map((e) => FoodAnalysisItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ---- persistence ----

  static Future<void> createMeal({
    required String mealType,
    String? imageDataUrl,
    String? description,
    required List<MealItem> items,
  }) async {
    final res = await _api.post('/api/meals', data: {
      'mealType': mealType,
      if (imageDataUrl != null) 'imageDataUrl': imageDataUrl,
      if (description != null && description.isNotEmpty) 'description': description,
      'manualItems': items.map((e) => e.toPayload()).toList(),
      'eatenAt': DateTime.now().toUtc().toIso8601String(),
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '儲存失敗，請稍後再試'),
          statusCode: res.statusCode);
    }
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
  static String mealImageUrl(Meal meal) => '${ApiClient.baseUrl}/api/meals/${meal.id}/image';
}
