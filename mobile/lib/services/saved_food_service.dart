import '../models/models.dart';
import 'api_client.dart';

class SavedFoodService {
  static final _api = ApiClient.instance;

  static Future<List<SavedFood>> list() async {
    final res = await _api.get('/api/saved-foods');
    if (!ApiClient.ok(res)) return [];
    final foods = res.data['foods'] as List? ?? [];
    return foods
        .map((e) => SavedFood.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<SavedFood?> findByBarcode(String barcode) async {
    final res = await _api.get('/api/saved-foods', query: {'barcode': barcode});
    if (!ApiClient.ok(res)) return null;
    final food = res.data['food'];
    if (food is! Map<String, dynamic>) return null;
    return SavedFood.fromJson(food);
  }

  static Future<void> create({
    String? barcode,
    required String name,
    required String estimatedAmount,
    required int calories,
    required double protein,
    required double fat,
    required double carbs,
    String source = 'MANUAL',
    bool isFavorite = false,
  }) async {
    final res = await _api.post(
      '/api/saved-foods',
      data: {
        if (barcode != null && barcode.trim().isNotEmpty)
          'barcode': barcode.trim(),
        'name': name,
        'estimatedAmount': estimatedAmount,
        'calories': calories,
        'protein': protein,
        'fat': fat,
        'carbs': carbs,
        'source': source,
        'isFavorite': isFavorite,
      },
    );
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '儲存常用食物失敗'));
    }
  }

  static Future<void> update(
    String id, {
    String? barcode,
    required String name,
    required String estimatedAmount,
    required int calories,
    required double protein,
    required double fat,
    required double carbs,
    String source = 'MANUAL',
    bool isFavorite = false,
  }) async {
    final res = await _api.patch(
      '/api/saved-foods/$id',
      data: {
        if (barcode != null && barcode.trim().isNotEmpty)
          'barcode': barcode.trim(),
        'name': name,
        'estimatedAmount': estimatedAmount,
        'calories': calories,
        'protein': protein,
        'fat': fat,
        'carbs': carbs,
        'source': source,
        'isFavorite': isFavorite,
      },
    );
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '更新常用食物失敗'));
    }
  }

  static Future<void> delete(String id) async {
    await _api.delete('/api/saved-foods/$id');
  }

  static Future<void> markUsed(String id) async {
    final res = await _api.post('/api/saved-foods/$id');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '更新常用食物使用紀錄失敗'));
    }
  }
}
