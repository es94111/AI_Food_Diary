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

    // Collapse to one record per (type, measuredAt) — the backend's unique key
    // is (userId, source, type, measuredAt), and a batch with duplicate keys
    // makes its transactional upsert fail with a 500. Health Connect can emit
    // several points sharing the same start time, so keep the last value.
    final byKey = <String, Map<String, dynamic>>{};
    for (final point in _health.removeDuplicates(data)) {
      final payload = _toPayload(point);
      byKey['${payload['type']}|${payload['measuredAt']}'] = payload;
    }
    return byKey.values.toList();
  }

  static Map<String, dynamic> _toPayload(HealthDataPoint p) {
    final type = switch (p.type) {
      HealthDataType.STEPS => 'STEPS',
      HealthDataType.WEIGHT => 'WEIGHT',
      HealthDataType.ACTIVE_ENERGY_BURNED => 'ACTIVE_CALORIES',
      _ => p.type.name,
    };
    final unit = switch (p.type) {
      HealthDataType.STEPS => 'count',
      HealthDataType.WEIGHT => 'kg',
      HealthDataType.ACTIVE_ENERGY_BURNED => 'kcal',
      _ => '',
    };
    final raw = p.value;
    final value = raw is NumericHealthValue
        ? raw.numericValue.toDouble()
        : double.tryParse(raw.toString()) ?? 0.0;
    return {
      'type': type,
      'value': value,
      'unit': unit,
      'measuredAt':
          DateFormat("yyyy-MM-dd'T'HH:mm:ss.000'Z'").format(p.dateFrom.toUtc()),
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
