import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/models.dart';
import 'api_client.dart';

class MealBundleService {
  static final _api = ApiClient.instance;

  static Map<String, dynamic>? _data(Response<dynamic> response) {
    final value = response.data;
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return null;
  }

  static MealBundle _bundleFrom(Response<dynamic> response) {
    final value = _data(response)?['bundle'];
    if (value is! Map) throw const FormatException('Invalid meal bundle response');
    return MealBundle.fromJson(Map<String, dynamic>.from(value));
  }

  static Never _throw(Response<dynamic> response, String fallback) {
    throw ApiException(
      ApiClient.errorMessage(response, fallback),
      statusCode: response.statusCode,
      data: _data(response),
    );
  }

  static Future<List<MealBundle>> list() async {
    final response = await _api.get('/api/meal-bundles', cache: false);
    if (!ApiClient.ok(response)) _throw(response, '無法載入餐組');
    final entries = _data(response)?['bundles'] as List? ?? const [];
    return entries
        .whereType<Map>()
        .map((entry) => MealBundle.fromJson(Map<String, dynamic>.from(entry)))
        .toList();
  }

  static String imageUrl(String id) => '${ApiClient.baseUrl}/api/meal-bundles/$id/image';

  static Future<String?> imageDataUrl(String id) async {
    try {
      final response = await _api.getBytes('/api/meal-bundles/$id/image');
      if (!ApiClient.ok(response) || response.data == null || response.data!.isEmpty) return null;
      final contentType = response.headers.value('content-type') ?? 'image/jpeg';
      return 'data:$contentType;base64,${base64Encode(response.data!)}';
    } catch (_) {
      return null;
    }
  }

  static Future<MealBundle> create({
    required String name,
    required List<MealBundleItem> items,
    String? imageDataUrl,
  }) async {
    final response = await _api.post('/api/meal-bundles', data: {
      'name': name,
      'items': items.map((item) => item.toPayload()).toList(),
      if (imageDataUrl != null && imageDataUrl.isNotEmpty) 'imageDataUrl': imageDataUrl,
    });
    if (!ApiClient.ok(response)) _throw(response, '儲存餐組失敗');
    return _bundleFrom(response);
  }

  static Future<MealBundle> createFromMeal(String mealId, String name) async {
    final response = await _api.post('/api/meal-bundles', data: {
      'name': name,
      'sourceMealId': mealId,
    });
    if (!ApiClient.ok(response)) _throw(response, '另存餐組失敗');
    return _bundleFrom(response);
  }

  static Future<MealBundle> update(
    String id, {
    required String name,
    required List<MealBundleItem> items,
    String? imageDataUrl,
    bool removeImage = false,
  }) async {
    final response = await _api.patch('/api/meal-bundles/$id', data: {
      'name': name,
      'items': items.map((item) => item.toPayload()).toList(),
      if (imageDataUrl != null && imageDataUrl.isNotEmpty) 'imageDataUrl': imageDataUrl,
      if (removeImage) 'removeImage': true,
    });
    if (!ApiClient.ok(response)) _throw(response, '更新餐組失敗');
    return _bundleFrom(response);
  }

  static Future<void> delete(String id) async {
    final response = await _api.delete('/api/meal-bundles/$id');
    if (!ApiClient.ok(response)) _throw(response, '刪除餐組失敗');
  }
}
