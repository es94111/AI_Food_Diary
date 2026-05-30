import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:health/health.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import 'api_client.dart';

/// Reads health data from Health Connect and syncs it to the backend.
///
/// Sync uses a dedicated `hcs_` Bearer token (registered as a HealthConnection
/// "device") so the web dashboard's connections panel shows last-synced time.
class HealthService {
  static final Health _health = Health();
  static final _api = ApiClient.instance;
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'hcs_token';

  static const _types = [
    HealthDataType.STEPS,
    HealthDataType.WEIGHT,
    HealthDataType.ACTIVE_ENERGY_BURNED,
  ];

  static List<HealthDataAccess> get _perms =>
      List.filled(_types.length, HealthDataAccess.READ);

  /// Ensures Health Connect is available and the read permissions are granted,
  /// requesting them if needed. Throws [ApiException] with a user-facing
  /// message when unavailable or denied.
  static Future<bool> requestPermissions() async {
    await _health.configure();

    // 1. Make sure the Health Connect provider is installed/up to date.
    final status = await _health.getHealthConnectSdkStatus();
    if (status == HealthConnectSdkStatus.sdkUnavailable) {
      throw ApiException('此裝置不支援 Health Connect（需 Android 8.0 以上）。');
    }
    if (status == HealthConnectSdkStatus.sdkUnavailableProviderUpdateRequired) {
      await _health.installHealthConnect();
      throw ApiException('請先安裝或更新 Health Connect，再回到 App 重新同步。');
    }

    // 2. If already granted, skip the dialog.
    final has = await _health.hasPermissions(_types, permissions: _perms);
    if (has == true) return true;

    // 3. Request authorization — this shows the Health Connect permission UI.
    final granted =
        await _health.requestAuthorization(_types, permissions: _perms);
    return granted;
  }

  static Future<bool> hasPermissions() async {
    await _health.configure();
    return (await _health.hasPermissions(_types, permissions: _perms)) ?? false;
  }

  static Future<List<Map<String, dynamic>>> _fetchLast7Days() async {
    final now = DateTime.now();
    final start = now.subtract(const Duration(days: 7));
    final data = await _health.getHealthDataFromTypes(
      startTime: start,
      endTime: now,
      types: _types,
    );

    // Health Connect stores steps/active-calories as thousands of fine-grained
    // interval records (per minute / per source) and the backend caps each sync
    // at 500 metrics. Roll up to one record per (type, local day): STEPS and
    // ACTIVE_CALORIES summed per day, WEIGHT keeps the latest reading per day.
    // This also makes "latest steps" mean today's total, not the last minute.
    final stepsByDay = <DateTime, double>{};
    final caloriesByDay = <DateTime, double>{};
    final weightByDay = <DateTime, HealthDataPoint>{};

    for (final p in _health.removeDuplicates(data)) {
      final day = _localDayStart(p.dateFrom);
      switch (p.type) {
        case HealthDataType.STEPS:
          stepsByDay[day] = (stepsByDay[day] ?? 0) + _numericValue(p);
        case HealthDataType.ACTIVE_ENERGY_BURNED:
          caloriesByDay[day] = (caloriesByDay[day] ?? 0) + _numericValue(p);
        case HealthDataType.WEIGHT:
          final existing = weightByDay[day];
          if (existing == null || p.dateTo.isAfter(existing.dateTo)) {
            weightByDay[day] = p;
          }
        default:
          break;
      }
    }

    final out = <Map<String, dynamic>>[];
    stepsByDay.forEach((day, v) =>
        out.add(_payload('STEPS', v.roundToDouble(), 'count', day)));
    caloriesByDay.forEach((day, v) =>
        out.add(_payload('ACTIVE_CALORIES', v.roundToDouble(), 'kcal', day)));
    weightByDay.forEach(
        (day, p) => out.add(_payload('WEIGHT', _numericValue(p), 'kg', day)));
    return out;
  }

  static final _isoUtc = DateFormat("yyyy-MM-dd'T'HH:mm:ss.000'Z'");

  static DateTime _localDayStart(DateTime d) {
    final l = d.toLocal();
    return DateTime(l.year, l.month, l.day);
  }

  static double _numericValue(HealthDataPoint p) {
    final raw = p.value;
    return raw is NumericHealthValue
        ? raw.numericValue.toDouble()
        : double.tryParse(raw.toString()) ?? 0.0;
  }

  static Map<String, dynamic> _payload(
      String type, double value, String unit, DateTime localDay) {
    return {
      'type': type,
      'value': value,
      'unit': unit,
      'measuredAt': _isoUtc.format(localDay.toUtc()),
    };
  }

  /// Ensures a sync device token exists, requests permissions, reads the last
  /// 7 days, and uploads. Returns the number of metrics synced.
  static Future<int> syncNow({String deviceName = 'Android'}) async {
    final granted = await requestPermissions();
    if (!granted) {
      throw ApiException('請在 Health Connect 中授予讀取權限');
    }
    final metrics = await _fetchLast7Days();
    debugPrint('HealthSync: fetched ${metrics.length} metrics');
    if (metrics.isEmpty) return 0;

    final token = await _ensureToken(deviceName);
    final res = await _api.post(
      '/api/health/sync',
      data: {'source': 'HEALTH_CONNECT', 'metrics': metrics},
      headers: {'Authorization': 'Bearer $token'},
    );
    debugPrint('HealthSync: sync response ${res.statusCode}: ${res.data}');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '健康資料同步失敗，請稍後再試。')
          .toString());
    }
    return (res.data['synced'] as num?)?.toInt() ?? metrics.length;
  }

  static Future<String> _ensureToken(String deviceName) async {
    final existing = await _storage.read(key: _tokenKey);
    if (existing != null && existing.isNotEmpty) return existing;
    // Register a new sync device (requires an active cookie session).
    final res = await _api.post('/api/health/connections',
        data: {'provider': 'HEALTH_CONNECT', 'deviceName': deviceName});
    debugPrint('HealthSync: connections response ${res.statusCode}: ${res.data}');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '建立健康同步裝置失敗'));
    }
    final token = res.data['token'] as String;
    await _storage.write(key: _tokenKey, value: token);
    return token;
  }

  // ---- status & device management (cookie session) ----

  static Future<HealthSyncStatus> status() async {
    final res = await _api.get('/api/health/sync');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '健康同步狀態讀取失敗'));
    }
    return HealthSyncStatus.fromJson(res.data as Map<String, dynamic>);
  }

  static Future<List<HealthConnection>> connections() async {
    final res = await _api.get('/api/health/connections');
    if (!ApiClient.ok(res)) return [];
    final list = res.data['connections'] as List? ?? [];
    return list
        .map((e) => HealthConnection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<void> revokeConnection(String id) async {
    await _api.delete('/api/health/connections/$id');
    await _storage.delete(key: _tokenKey);
  }

  static Future<void> clearToken() => _storage.delete(key: _tokenKey);
}
