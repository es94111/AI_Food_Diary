import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/models.dart';
import 'api_client.dart';

class SavedFoodService {
  static final _api = ApiClient.instance;

  /// Fetches a saved food's photo and returns it as a data URL (or null), so it
  /// can be reused as a meal photo when the food is picked.
  static Future<String?> imageDataUrl(String id) async {
    try {
      final res = await _api.getBytes('/api/saved-foods/$id/image');
      if (!ApiClient.ok(res)) return null;
      final bytes = res.data;
      if (bytes == null || bytes.isEmpty) return null;
      final contentType = res.headers.value('content-type') ?? 'image/jpeg';
      return 'data:$contentType;base64,${base64Encode(bytes)}';
    } catch (_) {
      return null;
    }
  }

  static Future<List<SavedFood>> list() async {
    try {
      final res = await _api.get('/api/saved-foods');
      if (!ApiClient.ok(res)) return [];
      final foods = res.data['foods'] as List? ?? [];
      return foods
          .map((e) => SavedFood.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      // Offline / DNS failure while loading the saved-foods suggestions: this
      // is a non-critical background fetch, so degrade gracefully to an empty
      // list instead of letting the exception crash the form. Real errors
      // (parsing, unexpected types) still propagate.
      if (ApiClient.isConnectivityError(e)) return [];
      rethrow;
    }
  }

  static Future<SavedFood?> findByBarcode(String barcode) async {
    final res = await _api.get('/api/saved-foods', query: {'barcode': barcode});
    if (!ApiClient.ok(res)) return null;
    final food = res.data['food'];
    if (food is! Map<String, dynamic>) return null;
    return SavedFood.fromJson(food);
  }

  /// Authenticated endpoint for a saved food's photo.
  static String imageUrl(String id) => '${ApiClient.baseUrl}/api/saved-foods/$id/image';

  static Future<void> create({
    String? barcode,
    required String name,
    required String estimatedAmount,
    required double calories,
    required double protein,
    required double fat,
    required double carbs,
    String source = 'MANUAL',
    bool isFavorite = false,
    String? imageDataUrl,
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
        if (imageDataUrl != null && imageDataUrl.isNotEmpty)
          'imageDataUrl': imageDataUrl,
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
    required double calories,
    required double protein,
    required double fat,
    required double carbs,
    String source = 'MANUAL',
    bool isFavorite = false,
    String? imageDataUrl,
    bool removeImage = false,
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
        if (imageDataUrl != null && imageDataUrl.isNotEmpty)
          'imageDataUrl': imageDataUrl,
        if (removeImage) 'removeImage': true,
      },
    );
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '更新常用食物失敗'));
    }
  }

  static Future<void> delete(String id) async {
    await _api.delete('/api/saved-foods/$id');
  }

  static Future<SavedFood> markUsed(String id) async {
    final res = await _api.post('/api/saved-foods/$id');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '更新常用食物使用紀錄失敗'));
    }
    final food = res.data['food'];
    if (food is! Map<String, dynamic>) {
      throw const FormatException('Invalid saved food response');
    }
    return SavedFood.fromJson(food);
  }
}
