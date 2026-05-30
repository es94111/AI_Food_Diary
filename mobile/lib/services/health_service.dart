import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:health/health.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    // activity / energy
    HealthDataType.STEPS,
    HealthDataType.DISTANCE_DELTA,
    HealthDataType.SPEED,
    HealthDataType.FLIGHTS_CLIMBED,
    HealthDataType.ACTIVITY_INTENSITY,
    HealthDataType.ACTIVE_ENERGY_BURNED,
    HealthDataType.BASAL_ENERGY_BURNED,
    HealthDataType.TOTAL_CALORIES_BURNED,
    HealthDataType.WORKOUT,
    // body measurements
    HealthDataType.WEIGHT,
    HealthDataType.HEIGHT,
    HealthDataType.BODY_FAT_PERCENTAGE,
    HealthDataType.LEAN_BODY_MASS,
    HealthDataType.BODY_WATER_MASS,
    HealthDataType.BODY_TEMPERATURE,
    HealthDataType.SKIN_TEMPERATURE,
    // vitals
    HealthDataType.HEART_RATE,
    HealthDataType.RESTING_HEART_RATE,
    HealthDataType.HEART_RATE_VARIABILITY_RMSSD,
    HealthDataType.RESPIRATORY_RATE,
    HealthDataType.BLOOD_OXYGEN,
    HealthDataType.BLOOD_PRESSURE_SYSTOLIC,
    HealthDataType.BLOOD_PRESSURE_DIASTOLIC,
    HealthDataType.BLOOD_GLUCOSE,
    // sleep (whole session + stages)
    HealthDataType.SLEEP_SESSION,
    HealthDataType.SLEEP_DEEP,
    HealthDataType.SLEEP_LIGHT,
    HealthDataType.SLEEP_REM,
    HealthDataType.SLEEP_AWAKE,
    // nutrition / hydration
    HealthDataType.WATER,
    HealthDataType.NUTRITION,
  ];

  /// Backend type id + unit + how to aggregate a day's worth of points.
  static (String, String, _Agg)? _mapType(HealthDataType t) => switch (t) {
        // activity / energy
        HealthDataType.STEPS => ('STEPS', 'count', _Agg.sum),
        HealthDataType.DISTANCE_DELTA => ('DISTANCE', 'm', _Agg.sum),
        HealthDataType.SPEED => ('SPEED', 'm/s', _Agg.average),
        HealthDataType.FLIGHTS_CLIMBED => ('FLIGHTS_CLIMBED', 'count', _Agg.sum),
        HealthDataType.ACTIVITY_INTENSITY => ('ACTIVITY_INTENSITY', 'min', _Agg.sum),
        HealthDataType.ACTIVE_ENERGY_BURNED => ('ACTIVE_CALORIES', 'kcal', _Agg.sum),
        HealthDataType.BASAL_ENERGY_BURNED => ('BASAL_CALORIES', 'kcal', _Agg.sum),
        HealthDataType.TOTAL_CALORIES_BURNED => ('TOTAL_CALORIES', 'kcal', _Agg.sum),
        HealthDataType.WORKOUT => ('EXERCISE', 'min', _Agg.duration),
        // body measurements
        HealthDataType.WEIGHT => ('WEIGHT', 'kg', _Agg.latest),
        HealthDataType.HEIGHT => ('HEIGHT', 'cm', _Agg.latest),
        HealthDataType.BODY_FAT_PERCENTAGE => ('BODY_FAT', '%', _Agg.latest),
        HealthDataType.LEAN_BODY_MASS => ('LEAN_BODY_MASS', 'kg', _Agg.latest),
        HealthDataType.BODY_WATER_MASS => ('BODY_WATER_MASS', 'kg', _Agg.latest),
        HealthDataType.BODY_TEMPERATURE => ('BODY_TEMPERATURE', '°C', _Agg.latest),
        HealthDataType.SKIN_TEMPERATURE => ('SKIN_TEMPERATURE', '°C', _Agg.latest),
        // vitals
        HealthDataType.HEART_RATE => ('HEART_RATE', 'bpm', _Agg.average),
        HealthDataType.RESTING_HEART_RATE => ('RESTING_HEART_RATE', 'bpm', _Agg.latest),
        HealthDataType.HEART_RATE_VARIABILITY_RMSSD => ('HRV', 'ms', _Agg.average),
        HealthDataType.RESPIRATORY_RATE => ('RESPIRATORY_RATE', 'rpm', _Agg.average),
        HealthDataType.BLOOD_OXYGEN => ('BLOOD_OXYGEN', '%', _Agg.average),
        HealthDataType.BLOOD_PRESSURE_SYSTOLIC => ('BLOOD_PRESSURE_SYSTOLIC', 'mmHg', _Agg.latest),
        HealthDataType.BLOOD_PRESSURE_DIASTOLIC => ('BLOOD_PRESSURE_DIASTOLIC', 'mmHg', _Agg.latest),
        HealthDataType.BLOOD_GLUCOSE => ('BLOOD_GLUCOSE', 'mg/dL', _Agg.latest),
        // sleep
        HealthDataType.SLEEP_SESSION => ('SLEEP', 'min', _Agg.duration),
        HealthDataType.SLEEP_DEEP => ('SLEEP_DEEP', 'min', _Agg.duration),
        HealthDataType.SLEEP_LIGHT => ('SLEEP_LIGHT', 'min', _Agg.duration),
        HealthDataType.SLEEP_REM => ('SLEEP_REM', 'min', _Agg.duration),
        HealthDataType.SLEEP_AWAKE => ('SLEEP_AWAKE', 'min', _Agg.duration),
        // nutrition / hydration
        HealthDataType.WATER => ('WATER', 'L', _Agg.sum),
        HealthDataType.NUTRITION => ('NUTRITION', 'kcal', _Agg.sum),
        _ => null,
      };

  /// Types whose aggregated value should be reported as a whole number.
  static const _integerTypes = {
    'STEPS',
    'DISTANCE',
    'FLIGHTS_CLIMBED',
    'ACTIVITY_INTENSITY',
    'ACTIVE_CALORIES',
    'BASAL_CALORIES',
    'TOTAL_CALORIES',
    'NUTRITION',
    'SLEEP',
    'SLEEP_DEEP',
    'SLEEP_LIGHT',
    'SLEEP_REM',
    'SLEEP_AWAKE',
    'EXERCISE',
    'HEART_RATE',
    'RESTING_HEART_RATE',
    'HRV',
    'RESPIRATORY_RATE',
    'BLOOD_OXYGEN',
    'BLOOD_PRESSURE_SYSTOLIC',
    'BLOOD_PRESSURE_DIASTOLIC',
    'BLOOD_GLUCOSE',
  };

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

    // Health Connect stores most metrics as thousands of fine-grained interval
    // records, and the backend caps each sync at 500. Roll up to one record per
    // (type, local day): cumulative metrics (steps, calories, water, nutrition,
    // sleep/exercise minutes) are summed; instantaneous ones (weight, height,
    // body fat, resting HR) keep the latest reading; heart rate is averaged.
    final accs = <(String, DateTime), _Acc>{};

    for (final p in _health.removeDuplicates(data)) {
      final mapping = _mapType(p.type);
      if (mapping == null) continue;
      final (backendType, unit, agg) = mapping;
      final day = _localDayStart(p.dateFrom);
      final acc = accs.putIfAbsent((backendType, day), () => _Acc(unit, agg));
      final value = _valueFor(p, backendType, agg);
      switch (agg) {
        case _Agg.sum:
        case _Agg.duration:
          acc.sum += value;
        case _Agg.average:
          acc.sum += value;
          acc.count += 1;
        case _Agg.latest:
          if (acc.lastAt == null || p.dateTo.isAfter(acc.lastAt!)) {
            acc.lastValue = value;
            acc.lastAt = p.dateTo;
          }
      }
    }

    final out = <Map<String, dynamic>>[];
    accs.forEach((key, acc) {
      final (backendType, day) = key;
      var value = switch (acc.agg) {
        _Agg.average => acc.count > 0 ? acc.sum / acc.count : 0.0,
        _Agg.latest => acc.lastValue,
        _ => acc.sum,
      };
      if (_integerTypes.contains(backendType)) value = value.roundToDouble();
      if (value <= 0 && acc.agg != _Agg.latest) return; // skip empty days
      out.add(_payload(backendType, value, acc.unit, day));
    });

    // Health Connect has no BMI record — derive it from the latest weight and
    // height (kg / m²) and emit one BMI metric per day that has a weight.
    final latestHeight = _latestLatestValue(accs, 'HEIGHT'); // cm
    if (latestHeight != null && latestHeight > 0) {
      final metres = latestHeight / 100;
      accs.forEach((key, acc) {
        if (key.$1 == 'WEIGHT' && acc.lastValue > 0) {
          final bmi = acc.lastValue / (metres * metres);
          out.add(_payload(
              'BMI', double.parse(bmi.toStringAsFixed(1)), '', key.$2));
        }
      });
    }
    return out;
  }

  static final _isoUtc = DateFormat("yyyy-MM-dd'T'HH:mm:ss.000'Z'");

  static DateTime _localDayStart(DateTime d) {
    final l = d.toLocal();
    return DateTime(l.year, l.month, l.day);
  }

  /// Most recent `latest`-aggregated value across all days for [backendType].
  static double? _latestLatestValue(
      Map<(String, DateTime), _Acc> accs, String backendType) {
    double? value;
    DateTime? at;
    accs.forEach((key, acc) {
      if (key.$1 == backendType && acc.lastAt != null) {
        if (at == null || acc.lastAt!.isAfter(at!)) {
          value = acc.lastValue;
          at = acc.lastAt;
        }
      }
    });
    return value;
  }

  /// Extracts a numeric value from a point for the given backend type.
  static double _valueFor(HealthDataPoint p, String backendType, _Agg agg) {
    // Sleep/exercise: use the session length (value encoding varies by source).
    if (agg == _Agg.duration) {
      final minutes = p.dateTo.difference(p.dateFrom).inMinutes;
      return minutes > 0 ? minutes.toDouble() : _numericValue(p);
    }
    final raw = p.value;
    if (raw is NutritionHealthValue) return (raw.calories ?? 0).toDouble();
    if (raw is NumericHealthValue) {
      var v = raw.numericValue.toDouble();
      if (backendType == 'HEIGHT') v *= 100; // package reports metres → cm
      return v;
    }
    return double.tryParse(raw.toString()) ?? 0.0;
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

  // ---- write nutrition (logged meals) back to Health Connect ----

  static const _writeNutritionKey = 'write_nutrition_hc';

  static Future<bool> isNutritionWriteEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_writeNutritionKey) ?? false;
  }

  /// Enables/disables writing logged meals to Health Connect. When enabling,
  /// requests WRITE_NUTRITION permission and only persists on success.
  static Future<bool> setNutritionWriteEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    if (!enabled) {
      await prefs.setBool(_writeNutritionKey, false);
      return false;
    }
    await _health.configure();
    final granted = await _health.requestAuthorization(
      [HealthDataType.NUTRITION],
      permissions: [HealthDataAccess.WRITE],
    );
    await prefs.setBool(_writeNutritionKey, granted);
    return granted;
  }

  static MealType _mealTypeOf(String type) => switch (type) {
        'BREAKFAST' => MealType.BREAKFAST,
        'LUNCH' => MealType.LUNCH,
        'DINNER' => MealType.DINNER,
        'SNACK' => MealType.SNACK,
        _ => MealType.UNKNOWN,
      };

  /// Writes one logged meal's nutrition to Health Connect as a NutritionRecord.
  /// Best-effort: returns false (no throw) on any failure. Re-requests the
  /// WRITE permission once if the first attempt is rejected.
  static Future<bool> writeMealNutrition({
    required String mealType,
    required DateTime eatenAt,
    required int calories,
    required double protein,
    required double fat,
    required double carbs,
    String? name,
  }) async {
    try {
      await _health.configure();
      Future<bool> doWrite() => _health.writeMeal(
            mealType: _mealTypeOf(mealType),
            startTime: eatenAt,
            endTime: eatenAt,
            caloriesConsumed: calories.toDouble(),
            carbohydrates: carbs,
            protein: protein,
            fatTotal: fat,
            name: (name != null && name.isNotEmpty) ? name : null,
          );

      var ok = await doWrite();
      debugPrint('HealthWrite: writeMeal -> $ok (cal=$calories)');
      if (!ok) {
        // Permission may have been revoked — ask once and retry.
        final granted = await _health.requestAuthorization(
          [HealthDataType.NUTRITION],
          permissions: [HealthDataAccess.WRITE],
        );
        debugPrint('HealthWrite: re-auth granted=$granted');
        if (granted) ok = await doWrite();
      }
      return ok;
    } catch (e) {
      debugPrint('HealthWrite: writeMeal failed $e');
      return false;
    }
  }
}

/// How a day's worth of points for a metric are reduced to a single value.
enum _Agg { sum, duration, latest, average }

/// Per-(type, day) accumulator used while aggregating Health Connect data.
class _Acc {
  _Acc(this.unit, this.agg);
  final String unit;
  final _Agg agg;
  double sum = 0;
  int count = 0;
  double lastValue = 0;
  DateTime? lastAt;
}
