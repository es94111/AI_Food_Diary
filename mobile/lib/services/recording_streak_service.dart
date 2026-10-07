import '../models/models.dart';
import '../utils/metabolism.dart';
import 'api_client.dart';

class RecordingStreakService {
  static final _api = ApiClient.instance;

  static Future<RecordingStreak> fetch({String? timeZone}) async {
    final query = <String, String>{'tzOffset': '${localTzOffsetMinutes()}'};
    if (timeZone != null) query['tz'] = timeZone;
    final response = await _api.get(
      '/api/me/streak',
      query: query,
      cache: true,
    );
    if (!ApiClient.ok(response)) {
      throw ApiException(ApiClient.errorMessage(response, '無法載入連續記錄'));
    }
    final data = response.data;
    if (data is! Map || data['streak'] is! Map<String, dynamic>) {
      throw ApiException('連續記錄資料不完整');
    }
    return RecordingStreak.fromJson(data['streak'] as Map<String, dynamic>);
  }
}
