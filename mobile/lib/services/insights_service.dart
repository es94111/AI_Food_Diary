import '../models/insights.dart';
import '../utils/metabolism.dart';
import 'api_client.dart';

class InsightsService {
  static final _api = ApiClient.instance;

  static Future<InsightsSnapshot> fetch({
    required String period,
    required DateTime date,
  }) async {
    final response = await _api.get(
      '/api/insights',
      query: {
        'period': period,
        'date': isoDate(date),
        'tzOffset': '${localTzOffsetMinutes()}',
      },
      cache: true,
    );
    if (!ApiClient.ok(response)) {
      throw ApiException(ApiClient.errorMessage(response, '趨勢資料讀取失敗'));
    }
    if (response.data is! Map<String, dynamic>) {
      throw ApiException('趨勢資料格式不正確');
    }
    return InsightsSnapshot.fromJson(response.data as Map<String, dynamic>);
  }
}
