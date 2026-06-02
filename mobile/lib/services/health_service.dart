import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:health/health.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api_client.dart';
import 'meal_service.dart';
import 'water_service.dart';

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
    final points = _health.removeDuplicates(data);

    // Health Connect stores most metrics as thousands of fine-grained interval
    // records, and the backend caps each sync at 500. Roll up to one record per
    // (type, local day): cumulative metrics (steps, calories, water, nutrition,
    // sleep/exercise minutes) are summed; instantaneous ones (weight, height,
    // body fat, resting HR) keep the latest reading; heart rate is averaged.
    final accs = <(String, DateTime), _Acc>{};

    for (final p in points) {
      final mapping = _mapType(p.type);
      if (mapping == null) continue;
      final (backendType, unit, agg) = mapping;
      // Sleep is aggregated separately (see _appendSleep) so we can also emit a
      // per-night stage timeline; skip the generic per-day roll-up for it here.
      if (backendType == 'SLEEP' || backendType.startsWith('SLEEP_')) continue;
      // Nutrition is uploaded straight from the app's logged meals
      // (see _mealNutritionMetrics) instead of round-tripping through Health
      // Connect, so skip the unreliable HC read-back for it here.
      if (backendType == 'NUTRITION') continue;
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
      // Body-composition ("latest") metrics keep the exact reading time so the
      // dashboard can label "幾月幾日幾點幾分"; daily aggregates stay day-stamped.
      final measuredAt = acc.agg == _Agg.latest ? (acc.lastAt ?? day) : day;
      out.add(_payload(backendType, value, acc.unit, measuredAt));
    });

    // Health Connect has no BMI record — derive it from the latest weight and
    // height (kg / m²) and emit one BMI metric per day that has a weight.
    final latestHeight = _latestLatestValue(accs, 'HEIGHT'); // cm
    if (latestHeight != null && latestHeight > 0) {
      final metres = latestHeight / 100;
      accs.forEach((key, acc) {
        if (key.$1 == 'WEIGHT' && acc.lastValue > 0) {
          final bmi = acc.lastValue / (metres * metres);
          out.add(_payload('BMI', double.parse(bmi.toStringAsFixed(1)), 'kg/m²',
              acc.lastAt ?? key.$2));
        }
      });
    }

    _appendSleep(points, out);
    return out;
  }

  /// Aggregates sleep separately from the generic roll-up: stage records
  /// (deep/light/REM/awake) each carry their own start/end, so we group them
  /// into nights (a gap > 3h starts a new night), attribute each night to the
  /// local day it *ended* on (the wake-up morning), and emit a SLEEP record
  /// carrying the full stage timeline in `raw` — the data a hypnogram needs.
  /// Stage totals (SLEEP_DEEP/LIGHT/REM/AWAKE) are emitted per night too.
  static void _appendSleep(
      List<HealthDataPoint> points, List<Map<String, dynamic>> out) {
    String? stageOf(HealthDataType t) => switch (t) {
          HealthDataType.SLEEP_DEEP => 'DEEP',
          HealthDataType.SLEEP_LIGHT => 'LIGHT',
          HealthDataType.SLEEP_REM => 'REM',
          HealthDataType.SLEEP_AWAKE => 'AWAKE',
          _ => null,
        };

    final segs = <_SleepSeg>[];
    for (final p in points) {
      final stage = stageOf(p.type);
      if (stage == null || !p.dateTo.isAfter(p.dateFrom)) continue;
      segs.add(_SleepSeg(stage, p.dateFrom, p.dateTo));
    }
    segs.sort((a, b) => a.from.compareTo(b.from));

    // Group consecutive stage segments into nights.
    const gap = Duration(hours: 3);
    final nights = <List<_SleepSeg>>[];
    for (final s in segs) {
      if (nights.isEmpty || s.from.difference(nights.last.last.to) > gap) {
        nights.add([s]);
      } else {
        nights.last.add(s);
      }
    }

    final byDay = <DateTime, List<_SleepSeg>>{};
    for (final night in nights) {
      final end = night.map((s) => s.to).reduce((a, b) => a.isAfter(b) ? a : b);
      (byDay[_localDayStart(end)] ??= []).addAll(night);
    }

    const stageTypes = {
      'DEEP': 'SLEEP_DEEP',
      'LIGHT': 'SLEEP_LIGHT',
      'REM': 'SLEEP_REM',
      'AWAKE': 'SLEEP_AWAKE',
    };
    byDay.forEach((day, list) {
      list.sort((a, b) => a.from.compareTo(b.from));
      final stageMinutes = <String, double>{};
      for (final s in list) {
        final mins = s.to.difference(s.from).inMinutes.toDouble();
        if (mins > 0) stageMinutes[s.stage] = (stageMinutes[s.stage] ?? 0) + mins;
      }
      final total = stageMinutes.values.fold<double>(0, (a, b) => a + b);
      if (total <= 0) return;

      final raw = [
        for (final s in list)
          {
            'stage': s.stage,
            'start': _isoUtc.format(s.from.toUtc()),
            'end': _isoUtc.format(s.to.toUtc()),
          }
      ];
      out.add(_payload('SLEEP', total.roundToDouble(), 'min', day, raw: raw));
      stageTypes.forEach((stage, type) {
        final mins = stageMinutes[stage] ?? 0;
        if (mins > 0) out.add(_payload(type, mins.roundToDouble(), 'min', day));
      });
    });

    // Fallback for trackers that only report a whole-session duration with no
    // stage breakdown: emit a plain SLEEP total (no hypnogram) for any day not
    // already covered by stage data.
    final stageDays = byDay.keys.toSet();
    final sessionByDay = <DateTime, double>{};
    for (final p in points) {
      if (p.type != HealthDataType.SLEEP_SESSION ||
          !p.dateTo.isAfter(p.dateFrom)) {
        continue;
      }
      final day = _localDayStart(p.dateTo);
      if (stageDays.contains(day)) continue;
      sessionByDay[day] =
          (sessionByDay[day] ?? 0) + p.dateTo.difference(p.dateFrom).inMinutes;
    }
    sessionByDay.forEach((day, mins) {
      if (mins > 0) out.add(_payload('SLEEP', mins.roundToDouble(), 'min', day));
    });
  }

  /// Builds NUTRITION metrics straight from the app's own logged meals, summed
  /// (calories) per local day. The Health Connect write→read round-trip for
  /// nutrition is unreliable — and redundant, since the app already owns the
  /// meal data — so we upload calories directly rather than reading them back.
  static Future<List<Map<String, dynamic>>> _mealNutritionMetrics(
      {int days = 7}) async {
    final now = DateTime.now();
    final byDay = <DateTime, double>{};
    for (var i = 0; i < days; i++) {
      try {
        final meals = await MealService.mealsForDay(now.subtract(Duration(days: i)));
        for (final meal in meals) {
          final day = _localDayStart(meal.eatenAt);
          byDay[day] = (byDay[day] ?? 0) + meal.totalCalories;
        }
      } catch (_) {
        // Skip days that fail to load; keep building the rest.
      }
    }
    final out = <Map<String, dynamic>>[];
    byDay.forEach((day, kcal) {
      if (kcal > 0) out.add(_payload('NUTRITION', kcal.roundToDouble(), 'kcal', day));
    });
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
      String type, double value, String unit, DateTime at,
      {List<Map<String, dynamic>>? raw}) {
    return {
      'type': type,
      'value': value,
      'unit': unit,
      'measuredAt': _isoUtc.format(at.toUtc()),
      if (raw != null && raw.isNotEmpty) 'raw': raw,
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
    // Nutrition comes straight from logged meals, not Health Connect.
    metrics.addAll(await _mealNutritionMetrics());
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

  // Meal ids already mirrored into Health Connect, so repeated syncs don't
  // create duplicate nutrition records.
  static const _writtenMealsKey = 'written_meal_hc_ids';

  /// Mirrors recently logged meals' nutrition into Health Connect, skipping any
  /// meal already written in a previous sync (tracked by id). Returns the
  /// number newly written.
  ///
  /// Called as part of the health-data sync so meals always flow into Health
  /// Connect during sync (no opt-in switch); requests the NUTRITION write
  /// permission once up front and silently no-ops if it isn't granted.
  static Future<int> writeRecentMealsToHealth({int days = 7}) async {
    await _health.configure();
    final granted = await _health.requestAuthorization(
      [HealthDataType.NUTRITION],
      permissions: [HealthDataAccess.WRITE],
    );
    if (!granted) {
      debugPrint('HealthWrite: NUTRITION write permission not granted');
      return 0;
    }

    final prefs = await SharedPreferences.getInstance();
    final written =
        (prefs.getStringList(_writtenMealsKey) ?? const <String>[]).toSet();

    final now = DateTime.now();
    final meals = <Meal>[];
    for (var i = 0; i < days; i++) {
      try {
        meals.addAll(await MealService.mealsForDay(now.subtract(Duration(days: i))));
      } catch (_) {
        // Skip days that fail to load; keep writing the rest.
      }
    }

    var count = 0;
    for (final meal in meals) {
      if (written.contains(meal.id)) continue;
      final name =
          meal.items.map((e) => e.name).where((n) => n.isNotEmpty).join('、');
      final ok = await writeMealNutrition(
        mealType: meal.mealType,
        eatenAt: meal.eatenAt,
        calories: meal.totalCalories,
        protein: meal.totalProtein,
        fat: meal.totalFat,
        carbs: meal.totalCarbs,
        name: name,
      );
      if (ok) {
        written.add(meal.id);
        count++;
      }
    }

    await prefs.setStringList(_writtenMealsKey, written.toList());
    debugPrint('HealthWrite: mirrored $count meals to Health Connect');
    return count;
  }

  // ---- write water (logged intake) back to Health Connect ----

  // Water-log ids already mirrored into Health Connect, so repeated syncs don't
  // create duplicate hydration records.
  static const _writtenWaterKey = 'written_water_hc_ids';

  /// Writes one logged water entry to Health Connect as a hydration record.
  /// Health Connect stores hydration in litres, so millilitres are converted.
  /// Best-effort: returns false (no throw) on any failure. Re-requests the
  /// WATER write permission once if the first attempt is rejected.
  static Future<bool> writeWaterLog({
    required DateTime drankAt,
    required int amountMl,
  }) async {
    try {
      await _health.configure();
      Future<bool> doWrite() => _health.writeHealthData(
            value: amountMl / 1000.0, // ml → L (Health Connect hydration unit)
            type: HealthDataType.WATER,
            startTime: drankAt,
            endTime: drankAt,
          );

      var ok = await doWrite();
      debugPrint('HealthWrite: writeWater -> $ok (ml=$amountMl)');
      if (!ok) {
        // Permission may have been revoked — ask once and retry.
        final granted = await _health.requestAuthorization(
          [HealthDataType.WATER],
          permissions: [HealthDataAccess.WRITE],
        );
        debugPrint('HealthWrite: water re-auth granted=$granted');
        if (granted) ok = await doWrite();
      }
      return ok;
    } catch (e) {
      debugPrint('HealthWrite: writeWater failed $e');
      return false;
    }
  }

  /// Mirrors recently logged water intake into Health Connect, skipping any
  /// entry already written in a previous sync (tracked by id). Returns the
  /// number newly written.
  ///
  /// Called as part of the health-data sync so logged water always flows into
  /// Health Connect during sync (no opt-in switch); requests the WATER write
  /// permission once up front and silently no-ops if it isn't granted.
  static Future<int> writeRecentWaterToHealth({int days = 7}) async {
    await _health.configure();
    final granted = await _health.requestAuthorization(
      [HealthDataType.WATER],
      permissions: [HealthDataAccess.WRITE],
    );
    if (!granted) {
      debugPrint('HealthWrite: WATER write permission not granted');
      return 0;
    }

    final prefs = await SharedPreferences.getInstance();
    final written =
        (prefs.getStringList(_writtenWaterKey) ?? const <String>[]).toSet();

    final now = DateTime.now();
    final logs = <WaterLog>[];
    for (var i = 0; i < days; i++) {
      try {
        final day = await WaterService.forDay(now.subtract(Duration(days: i)));
        logs.addAll(day.logs);
      } catch (_) {
        // Skip days that fail to load; keep writing the rest.
      }
    }

    var count = 0;
    for (final log in logs) {
      if (written.contains(log.id) || log.amountMl <= 0) continue;
      final ok =
          await writeWaterLog(drankAt: log.drankAt, amountMl: log.amountMl);
      if (ok) {
        written.add(log.id);
        count++;
      }
    }

    await prefs.setStringList(_writtenWaterKey, written.toList());
    debugPrint('HealthWrite: mirrored $count water logs to Health Connect');
    return count;
  }
}

/// One sleep stage interval (deep/light/REM/awake) with its wall-clock span.
class _SleepSeg {
  _SleepSeg(this.stage, this.from, this.to);
  final String stage;
  final DateTime from;
  final DateTime to;
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
