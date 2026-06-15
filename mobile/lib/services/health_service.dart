import 'dart:math';

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

  // The sync *gate* only needs READ: the cloud upload depends on reading Health
  // Connect metrics, nothing more. Nutrition/water WRITE (used only to mirror
  // logged meals/water into Health Connect → Samsung Health) is requested
  // separately and best-effort in requestPermissions, so a denied/locked write
  // grant can never block the cloud sync (which previously aborted the whole
  // sync — including the cloud nutrition upload — when write wasn't granted).
  static List<HealthDataAccess> get _perms =>
      List.filled(_types.length, HealthDataAccess.READ);

  // Types we also write back to Health Connect (logged meals/water) so Samsung
  // Health and other readers can pick them up.
  static const _writeTypes = [HealthDataType.NUTRITION, HealthDataType.WATER];
  static const _writePerms = [HealthDataAccess.WRITE, HealthDataAccess.WRITE];

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

    // 2. Ensure READ access — this is required; the cloud sync reads Health
    //    Connect metrics. This is the only thing that gates a successful sync.
    final hasRead = await _health.hasPermissions(_types, permissions: _perms);
    final readGranted = hasRead == true
        ? true
        : await _health.requestAuthorization(_types, permissions: _perms);

    // 3. Best-effort: also ask for nutrition/water WRITE so logged meals/water
    //    mirror into Health Connect (→ Samsung Health). A denied write must NOT
    //    block the cloud sync, so the result is intentionally ignored here.
    try {
      final hasWrite =
          await _health.hasPermissions(_writeTypes, permissions: _writePerms);
      if (hasWrite != true) {
        await _health.requestAuthorization(_writeTypes,
            permissions: _writePerms);
      }
    } catch (_) {}

    return readGranted;
  }

  static Future<bool> hasPermissions() async {
    await _health.configure();
    return (await _health.hasPermissions(_types, permissions: _perms)) ?? false;
  }

  /// Whether Health Connect has granted NUTRITION write access — required to
  /// mirror logged meals into Health Connect (and onward to Samsung Health).
  /// Used to warn the user when nutrition won't reach Samsung Health.
  static Future<bool> hasNutritionWritePermission() async {
    await _health.configure();
    return (await _health.hasPermissions([HealthDataType.NUTRITION],
            permissions: [HealthDataAccess.WRITE])) ??
        false;
  }

  static Future<List<Map<String, dynamic>>> _fetchRecent(int days) async {
    final now = DateTime.now();
    final start = now.subtract(Duration(days: days));
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
      // Water is likewise uploaded straight from the app's logged intake (see
      // _waterIntakeMetrics); skip the HC read-back so the two don't collide on
      // the same (source, type, day) upsert key.
      if (backendType == 'WATER') continue;
      // Steps are read via Health Connect's de-duplicating aggregation API
      // (see _appendSteps) instead of summing raw records. Summing the raw
      // STEPS records double-counts when more than one app writes steps (phone
      // pedometer + watch + Google Fit, …), inflating the daily total; skip the
      // generic per-day roll-up for STEPS here.
      if (backendType == 'STEPS') continue;
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

    await _appendSteps(out, days);
    _appendSleep(points, out);
    return out;
  }

  /// Emits one STEPS metric per local day using Health Connect's aggregation
  /// API (`getTotalStepsInInterval`), which de-duplicates overlapping step
  /// records across data sources — the same number Health Connect itself shows.
  ///
  /// Summing the raw STEPS records (the generic roll-up) instead double-counts
  /// whenever more than one app writes steps (phone pedometer + watch + Google
  /// Fit, …): their records overlap in time and `removeDuplicates` only drops
  /// exactly-identical points, so the daily total climbs far past reality.
  static Future<void> _appendSteps(List<Map<String, dynamic>> out, int days) async {
    final now = DateTime.now();
    for (var i = 0; i < days; i++) {
      final dayStart = _localDayStart(now.subtract(Duration(days: i)));
      final dayEnd = dayStart.add(const Duration(days: 1));
      try {
        final steps = await _health.getTotalStepsInInterval(dayStart, dayEnd);
        if (steps != null && steps > 0) {
          out.add(_payload('STEPS', steps.toDouble(), 'count', dayStart));
        }
      } catch (_) {
        // Skip days the aggregation fails for; keep building the rest.
      }
    }
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

  /// Builds WATER metrics straight from the app's own logged water intake,
  /// summed (millilitres → litres) per local day. Like nutrition, the Health
  /// Connect round-trip is unreliable — and the app already owns the water data
  /// — so we upload it directly rather than reading it back from Health Connect.
  static Future<List<Map<String, dynamic>>> _waterIntakeMetrics(
      {int days = 7}) async {
    final now = DateTime.now();
    final byDay = <DateTime, int>{};
    for (var i = 0; i < days; i++) {
      try {
        final day = await WaterService.forDay(now.subtract(Duration(days: i)));
        for (final log in day.logs) {
          final d = _localDayStart(log.drankAt);
          byDay[d] = (byDay[d] ?? 0) + log.amountMl;
        }
      } catch (_) {
        // Skip days that fail to load; keep building the rest.
      }
    }
    final out = <Map<String, dynamic>>[];
    byDay.forEach((day, ml) {
      if (ml > 0) out.add(_payload('WATER', ml / 1000.0, 'L', day));
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

  // The backend caps each /api/health/sync request at 500 metrics, so longer
  // ranges (a year aggregates ~30 types × 365 days) must be uploaded in batches.
  static const _syncBatchSize = 500;

  // Meals/water are the app's own data, backfilled one backend request per day,
  // so a multi-year range would fire hundreds of round-trips for days the user
  // never logged. The Health Connect history (steps/weight/vitals/sleep) is what
  // a long range is really for; cap the app-owned backfill at this many days.
  static const appDataMaxDays = 31;

  /// Ensures a sync device token exists, requests permissions, reads the last
  /// [days] days, and uploads (in ≤500-metric batches). Returns the number of
  /// metrics synced.
  static Future<int> syncNow({String deviceName = 'Android', int days = 7}) async {
    final granted = await requestPermissions();
    if (!granted) {
      throw ApiException('請在 Health Connect 中授予讀取權限');
    }
    final metrics = await _fetchRecent(days);
    final appDays = min(days, appDataMaxDays);
    // Nutrition comes straight from logged meals, not Health Connect.
    metrics.addAll(await _mealNutritionMetrics(days: appDays));
    // Water comes straight from the app's logged intake, not Health Connect.
    metrics.addAll(await _waterIntakeMetrics(days: appDays));
    debugPrint('HealthSync: fetched ${metrics.length} metrics (${days}d)');
    if (metrics.isEmpty) return 0;

    final token = await _ensureToken(deviceName);
    // Upload in batches of at most _syncBatchSize so a long range doesn't trip
    // the backend's 500-metric-per-request limit (which would 400 the whole lot).
    var synced = 0;
    for (var i = 0; i < metrics.length; i += _syncBatchSize) {
      final batch = metrics.sublist(
          i, min(i + _syncBatchSize, metrics.length));
      final res = await _api.post(
        '/api/health/sync',
        data: {'source': 'HEALTH_CONNECT', 'metrics': batch},
        headers: {'Authorization': 'Bearer $token'},
      );
      debugPrint('HealthSync: batch ${res.statusCode}: ${res.data}');
      if (!ApiClient.ok(res)) {
        throw ApiException(ApiClient.errorMessage(res, '健康資料同步失敗，請稍後再試。')
            .toString());
      }
      synced += (res.data['synced'] as num?)?.toInt() ?? batch.length;
    }
    return synced;
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

  /// Recent history time series for one or more metric [types] (joined into the
  /// `types` query param server-side), backing the tap-to-drill-down trend
  /// charts. Cookie-session auth, same as [status].
  static Future<List<HealthHistorySeries>> history(List<String> types,
      {int limit = 30}) async {
    final res = await _api.get('/api/health/history',
        query: {'types': types.join(','), 'limit': '$limit'});
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '歷史數據讀取失敗'));
    }
    final list = res.data['series'] as List? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(HealthHistorySeries.fromJson)
        .toList();
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
    required double calories,
    required double protein,
    required double fat,
    required double carbs,
    String? name,
    String? clientRecordId,
  }) async {
    try {
      await _health.configure();
      // Tag the record with the meal id as Health Connect's clientRecordId so
      // re-writing the same meal upserts instead of creating a duplicate. The
      // version must be non-null for HC to honour the client id; a constant is
      // fine since we only need stable identity, not edit-tracking.
      Future<bool> doWrite() => _health.writeMeal(
            mealType: _mealTypeOf(mealType),
            startTime: eatenAt,
            endTime: eatenAt,
            caloriesConsumed: calories.toDouble(),
            carbohydrates: carbs,
            protein: protein,
            fatTotal: fat,
            name: (name != null && name.isNotEmpty) ? name : null,
            clientRecordId: clientRecordId,
            clientRecordVersion: clientRecordId == null ? null : 1,
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

  /// Mirrors recently logged meals' nutrition into Health Connect. Every recent
  /// meal is (re-)written each sync, tagged with the meal id as Health Connect's
  /// clientRecordId so HC upserts rather than duplicating. Returns the number
  /// written.
  ///
  /// This deliberately does NOT keep a local "already-written" set: that set
  /// could permanently skip a meal whose earlier write never actually landed in
  /// Health Connect (e.g. before Samsung Health was linked, or after the user
  /// cleared Health Connect data), leaving its nutrition stuck out forever.
  /// Native clientRecordId dedup makes re-writing safe and self-healing.
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

    final now = DateTime.now();
    final meals = <Meal>[];
    // App-owned data is backfilled one request per day, so cap the window even
    // when a long Health Connect range is selected (see appDataMaxDays).
    final span = min(days, appDataMaxDays);
    for (var i = 0; i < span; i++) {
      try {
        meals.addAll(await MealService.mealsForDay(now.subtract(Duration(days: i))));
      } catch (_) {
        // Skip days that fail to load; keep writing the rest.
      }
    }

    var count = 0;
    for (final meal in meals) {
      if (meal.totalCalories <= 0) continue;
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
        clientRecordId: 'meal_${meal.id}',
      );
      if (ok) count++;
    }

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
    // App-owned data is backfilled one request per day, so cap the window even
    // when a long Health Connect range is selected (see appDataMaxDays).
    final span = min(days, appDataMaxDays);
    for (var i = 0; i < span; i++) {
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
