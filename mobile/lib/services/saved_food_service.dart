import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/models.dart';
import 'api_client.dart';

class SavedFoodMatch {
  const SavedFoodMatch({
    required this.food,
    required this.reason,
    required this.score,
    required this.archived,
  });

  final SavedFood food;
  final String reason;
  final double score;
  final bool archived;

  factory SavedFoodMatch.fromJson(Map<String, dynamic> json) => SavedFoodMatch(
    food: SavedFood.fromJson(Map<String, dynamic>.from(json['food'] as Map)),
    reason: json['reason']?.toString() ?? 'similar',
    score: (json['score'] as num?)?.toDouble() ?? 0,
    archived: json['archived'] == true,
  );
}

class DuplicateFoodException extends ApiException {
  DuplicateFoodException(
    super.message, {
    required super.statusCode,
    required super.data,
    this.exactBarcode,
    this.duplicates = const [],
  });

  final SavedFoodMatch? exactBarcode;
  final List<SavedFoodMatch> duplicates;

  factory DuplicateFoodException.fromResponse(
    Response<dynamic> response,
    Map<String, dynamic> data,
  ) {
    SavedFoodMatch? exact;
    final exactData = data['exactBarcode'];
    if (exactData is Map) {
      exact = SavedFoodMatch.fromJson(Map<String, dynamic>.from(exactData));
    }
    final duplicates = <SavedFoodMatch>[];
    final duplicateData = data['duplicates'];
    if (duplicateData is List) {
      for (final entry in duplicateData) {
        if (entry is Map) {
          duplicates.add(
            SavedFoodMatch.fromJson(Map<String, dynamic>.from(entry)),
          );
        }
      }
    }
    return DuplicateFoodException(
      data['error']?.toString() ?? '可能已經存在相同或相似的食物。',
      statusCode: response.statusCode,
      data: data,
      exactBarcode: exact,
      duplicates: duplicates,
    );
  }
}

class SavedFoodService {
  static final _api = ApiClient.instance;

  static Map<String, dynamic>? _data(Response<dynamic> response) {
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return null;
  }

  static SavedFood _foodFrom(Response<dynamic> response) {
    final food = _data(response)?['food'];
    if (food is! Map) {
      throw const FormatException('Invalid saved food response');
    }
    return SavedFood.fromJson(Map<String, dynamic>.from(food));
  }

  static Never _throwResponse(Response<dynamic> response, String fallback) {
    final data = _data(response);
    if (response.statusCode == 409 && data?['code'] == 'DUPLICATE_FOOD') {
      throw DuplicateFoodException.fromResponse(response, data!);
    }
    throw ApiException(
      ApiClient.errorMessage(response, fallback),
      statusCode: response.statusCode,
      data: data,
    );
  }

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

  static Future<List<SavedFood>> list({bool archived = false}) async {
    try {
      final res = await _api.get(
        '/api/saved-foods',
        query: archived ? {'archived': 'true'} : null,
        cache: !archived,
      );
      if (!ApiClient.ok(res)) {
        _throwResponse(res, archived ? '無法載入已封存食物' : '無法載入我的食物');
      }
      final foods = _data(res)?['foods'] as List? ?? const [];
      return foods
          .whereType<Map>()
          .map((entry) => SavedFood.fromJson(Map<String, dynamic>.from(entry)))
          .toList();
    } on DioException catch (error) {
      if (ApiClient.isConnectivityError(error)) return [];
      rethrow;
    }
  }

  /// Last cached active-food list from a previous [list] call.
  static Future<List<SavedFood>> cachedList() async {
    final raw = await _api.cached('/api/saved-foods');
    if (raw is! Map) return [];
    final foods = raw['foods'] as List? ?? const [];
    try {
      return foods
          .whereType<Map>()
          .map((entry) => SavedFood.fromJson(Map<String, dynamic>.from(entry)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<SavedFood?> findByBarcode(String barcode) async {
    final res = await _api.get('/api/saved-foods', query: {'barcode': barcode});
    if (!ApiClient.ok(res)) _throwResponse(res, '條碼查詢失敗');
    final food = _data(res)?['food'];
    if (food is! Map) return null;
    return SavedFood.fromJson(Map<String, dynamic>.from(food));
  }

  /// Authenticated endpoint for a saved food's photo.
  static String imageUrl(String id) =>
      '${ApiClient.baseUrl}/api/saved-foods/$id/image';

  static Future<SavedFood> create({
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
    bool allowDuplicate = false,
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
        if (allowDuplicate) 'allowDuplicate': true,
      },
    );
    if (!ApiClient.ok(res)) _throwResponse(res, '儲存食物失敗');
    return _foodFrom(res);
  }

  static Future<SavedFood> update(
    String id, {
    String? barcode,
    required String name,
    required String estimatedAmount,
    required double calories,
    required double protein,
    required double fat,
    required double carbs,
    bool isFavorite = false,
    String? imageDataUrl,
    bool removeImage = false,
  }) async {
    final res = await _api.patch(
      '/api/saved-foods/$id',
      data: savedFoodUpdatePayload(
        barcode: barcode,
        name: name,
        estimatedAmount: estimatedAmount,
        calories: calories,
        protein: protein,
        fat: fat,
        carbs: carbs,
        isFavorite: isFavorite,
        imageDataUrl: imageDataUrl,
        removeImage: removeImage,
      ),
    );
    if (!ApiClient.ok(res)) _throwResponse(res, '更新食物失敗');
    return _foodFrom(res);
  }

  static Future<void> archive(String id) async {
    final res = await _api.delete('/api/saved-foods/$id');
    if (!ApiClient.ok(res)) _throwResponse(res, '封存食物失敗');
  }

  static Future<int> archiveBatch(Iterable<String> ids) async {
    final uniqueIds = ids.toSet().toList(growable: false);
    var archivedCount = 0;
    for (var start = 0; start < uniqueIds.length; start += 100) {
      final end = start + 100 < uniqueIds.length
          ? start + 100
          : uniqueIds.length;
      final res = await _api.patch(
        '/api/saved-foods/batch',
        data: {'ids': uniqueIds.sublist(start, end)},
      );
      if (!ApiClient.ok(res)) _throwResponse(res, '批次封存食物失敗');
      archivedCount += (_data(res)?['archivedCount'] as num?)?.toInt() ?? 0;
    }
    return archivedCount;
  }

  static Future<SavedFood> restore(String id) async {
    final res = await _api.patch(
      '/api/saved-foods/$id',
      data: {'archived': false},
    );
    if (!ApiClient.ok(res)) _throwResponse(res, '還原食物失敗');
    return _foodFrom(res);
  }

  static Future<SavedFood> markUsed(String id) async {
    final res = await _api.post('/api/saved-foods/$id');
    if (!ApiClient.ok(res)) _throwResponse(res, '更新食物使用紀錄失敗');
    return _foodFrom(res);
  }
}

Map<String, dynamic> savedFoodUpdatePayload({
  required String? barcode,
  required String name,
  required String estimatedAmount,
  required double calories,
  required double protein,
  required double fat,
  required double carbs,
  required bool isFavorite,
  String? imageDataUrl,
  bool removeImage = false,
}) => {
  // Null is intentional: omitting the field means "keep the old barcode".
  'barcode': barcode == null || barcode.trim().isEmpty ? null : barcode.trim(),
  'name': name,
  'estimatedAmount': estimatedAmount,
  'calories': calories,
  'protein': protein,
  'fat': fat,
  'carbs': carbs,
  'isFavorite': isFavorite,
  if (imageDataUrl != null && imageDataUrl.isNotEmpty)
    'imageDataUrl': imageDataUrl,
  if (removeImage) 'removeImage': true,
};
