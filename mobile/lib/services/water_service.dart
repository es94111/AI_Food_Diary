import '../models/models.dart';
import '../utils/metabolism.dart';
import 'api_client.dart';

/// Water-intake logging. Mirrors the web `/api/water` endpoints: list/total for
/// a local day, quick-add a single amount, and delete one entry.
class WaterService {
  static final _api = ApiClient.instance;

  /// Today's (or [day]'s) water logs plus the day total, in ml.
  static Future<({List<WaterLog> logs, int totalMl})> forDay(DateTime day) async {
    final res = await _api.get('/api/water',
        query: {'date': isoDate(day), 'tzOffset': '${localTzOffsetMinutes()}'},
        cache: true);
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法載入喝水紀錄'));
    }
    final list = (res.data['logs'] as List? ?? [])
        .map((e) => WaterLog.fromJson(e as Map<String, dynamic>))
        .toList();
    return (logs: list, totalMl: _toIntSafe(res.data['totalMl']));
  }

  /// Last cached result for [day] from a previous [forDay] call, or null if
  /// none cached yet. Lets the water card paint instantly on open instead of
  /// waiting on the network.
  static Future<({List<WaterLog> logs, int totalMl})?> cachedForDay(
      DateTime day) async {
    final data = await _api.cached('/api/water',
        query: {'date': isoDate(day), 'tzOffset': '${localTzOffsetMinutes()}'});
    if (data is! Map<String, dynamic>) return null;
    try {
      final list = (data['logs'] as List? ?? [])
          .map((e) => WaterLog.fromJson(e as Map<String, dynamic>))
          .toList();
      return (logs: list, totalMl: _toIntSafe(data['totalMl']));
    } catch (_) {
      return null;
    }
  }

  static Future<void> add(int amountMl) async {
    final res = await _api.post('/api/water', data: {
      'amountMl': amountMl,
      'drankAt': DateTime.now().toUtc().toIso8601String(),
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '儲存失敗，請稍後再試'),
          statusCode: res.statusCode);
    }
  }

  static Future<void> delete(String id) async {
    final res = await _api.delete('/api/water/$id');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '刪除失敗，請稍後再試'));
    }
  }

  static int _toIntSafe(dynamic v) {
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}
