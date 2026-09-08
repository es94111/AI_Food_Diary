import 'package:dio/dio.dart';

import '../models/models.dart';
import 'api_client.dart';

typedef AiActivityPageLoader = Future<AiActivityPage> Function(
  AiActivityQuery query,
);
typedef AiActivityDetailLoader = Future<AiActivityDetail> Function(
  String eventId,
);
typedef AiActivityRestoreAction = Future<void> Function(
  String eventId, {
  required String reason,
  String? expectedVersion,
});

/// Authenticated Web/App API access for the immutable AI activity trail.
///
/// Restore is intentionally exposed only through the human-facing session API.
/// This service never calls the MCP endpoint and never caches restore previews.
class AiActivityService {
  AiActivityService._();

  static final _api = ApiClient.instance;

  static Future<AiActivityPage> fetchPage(AiActivityQuery query) async {
    final response = await _api.get(
      '/api/ai-activity',
      query: query.toQueryParameters(),
    );
    if (!ApiClient.ok(response)) {
      throw _apiException(
        response,
        _responseMapOrEmpty(response),
        '無法載入 AI 操作紀錄',
      );
    }
    return AiActivityPage.fromJson(_responseMap(response));
  }

  static Future<AiActivityDetail> fetchDetail(String eventId) async {
    final response = await _api.get(
      '/api/ai-activity/${Uri.encodeComponent(eventId)}',
    );
    if (!ApiClient.ok(response)) {
      throw _apiException(
        response,
        _responseMapOrEmpty(response),
        '無法載入 AI 操作詳情',
      );
    }
    return AiActivityDetail.fromJson(_responseMap(response));
  }

  static Future<void> restore(
    String eventId, {
    required String reason,
    String? expectedVersion,
  }) async {
    final response = await _api.post(
      '/api/ai-activity/${Uri.encodeComponent(eventId)}/restore',
      data: {
        'confirm': true,
        'reason': reason.trim(),
        if (expectedVersion != null && expectedVersion.isNotEmpty)
          'expectedVersion': expectedVersion,
      },
    );
    if (ApiClient.ok(response)) return;
    throw _apiException(response, _responseMapOrEmpty(response), '還原未完成');
  }

  static Map<String, dynamic> _responseMap(Response<dynamic> response) {
    final data = response.data;
    if (data is Map) return Map<String, dynamic>.from(data);
    throw ApiException('伺服器回傳格式不正確。', statusCode: response.statusCode);
  }

  static Map<String, dynamic> _responseMapOrEmpty(Response<dynamic> response) {
    final data = response.data;
    return data is Map ? Map<String, dynamic>.from(data) : const {};
  }

  static ApiException _apiException(
    Response<dynamic> response,
    Map<String, dynamic> body,
    String fallback,
  ) {
    final nestedError = body['error'];
    final nestedMessage = nestedError is Map
        ? nestedError['message']?.toString()
        : null;
    final message = nestedError is String
        ? nestedError
        : nestedMessage ?? body['message']?.toString() ?? fallback;
    return ApiException(message, statusCode: response.statusCode, data: body);
  }
}
