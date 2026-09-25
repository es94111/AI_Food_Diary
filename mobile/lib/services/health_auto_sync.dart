import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'app_logger.dart';
import 'health_service.dart';

/// Coalesces app-owned meal and water edits before refreshing their cloud
/// health totals. This never requests Health Connect permissions or delays the
/// user's save action. Pending dates are persisted per account so an upload
/// interrupted by closing the app can resume after the next sign-in.
class HealthAutoSync extends ChangeNotifier {
  HealthAutoSync({
    required this.upload,
    this.debounce = const Duration(seconds: 3),
    this.minInterval = const Duration(minutes: 2),
    DateTime Function()? clock,
    this.persistPending = false,
  }) : _clock = clock ?? DateTime.now;

  static final instance = HealthAutoSync(
    upload: (nutritionDays, waterDays) => HealthService.syncAppDataForDays(
      nutritionDays: nutritionDays,
      waterDays: waterDays,
    ),
    persistPending: true,
  );

  @visibleForTesting
  final Future<void> Function(Set<DateTime>, Set<DateTime>) upload;
  final Duration debounce;
  final Duration minInterval;
  final DateTime Function() _clock;
  final bool persistPending;

  final Set<DateTime> _nutritionDays = {};
  final Set<DateTime> _waterDays = {};
  final Set<DateTime> _uploadingNutrition = {};
  final Set<DateTime> _uploadingWater = {};
  Timer? _timer;
  bool _running = false;
  bool _retrying = false;
  DateTime? _lastAttempt;
  String? _sessionCookie;
  String? _userId;
  int _sessionGeneration = 0;
  int _uploadingGeneration = -1;
  Future<void> _pendingWrite = Future.value();

  bool get retrying => _retrying;

  /// Restores unsent dates only for the signed-in account. The queue stores
  /// dates, never meal details or session credentials.
  Future<void> activateForUser(String userId) async {
    if (_userId == userId) return;
    deactivate();
    _userId = userId;
    _sessionCookie = ApiClient.instance.sessionCookie;
    if (!persistPending) return;
    await _pendingWrite;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey(userId));
      if (_userId != userId || raw == null) return;
      final saved = jsonDecode(raw) as Map<String, dynamic>;
      for (final value in (saved['nutrition'] as List? ?? const [])) {
        final day = DateTime.tryParse(value.toString());
        if (day != null) _nutritionDays.add(day);
      }
      for (final value in (saved['water'] as List? ?? const [])) {
        final day = DateTime.tryParse(value.toString());
        if (day != null) _waterDays.add(day);
      }
      _schedule();
    } catch (e) {
      AppLogger.log('HealthAutoSync', '無法還原待同步日期：$e');
    }
  }

  void deactivate() {
    _timer?.cancel();
    _nutritionDays.clear();
    _waterDays.clear();
    _userId = null;
    _sessionCookie = null;
    _sessionGeneration++;
    _retrying = false;
    notifyListeners();
  }

  static String _storageKey(String userId) =>
      'health_auto_sync_pending_$userId';

  void _persist() {
    final userId = _userId;
    if (!persistPending || userId == null) return;
    final nutrition = {
      ..._nutritionDays,
      if (_uploadingGeneration == _sessionGeneration) ..._uploadingNutrition,
    };
    final water = {
      ..._waterDays,
      if (_uploadingGeneration == _sessionGeneration) ..._uploadingWater,
    };
    final snapshot = jsonEncode({
      'nutrition': (nutrition.toList()..sort())
          .map((day) => day.toIso8601String())
          .toList(),
      'water': (water.toList()..sort())
          .map((day) => day.toIso8601String())
          .toList(),
    });
    _pendingWrite = _pendingWrite
        .then((_) async {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_storageKey(userId), snapshot);
        })
        .catchError((Object e) {
          AppLogger.log('HealthAutoSync', '無法儲存待同步日期：$e');
        });
  }

  @visibleForTesting
  Future<void> get pendingWrite => _pendingWrite;

  void nutritionChanged(DateTime day) => _queue(day, nutrition: true);

  void waterChanged(DateTime day) => _queue(day, nutrition: false);

  void _queue(DateTime day, {required bool nutrition}) {
    final cookie = ApiClient.instance.sessionCookie;
    if (_sessionCookie != cookie) {
      if (_userId == null) {
        _nutritionDays.clear();
        _waterDays.clear();
      } else if (_uploadingGeneration == _sessionGeneration) {
        _nutritionDays.addAll(_uploadingNutrition);
        _waterDays.addAll(_uploadingWater);
      }
      _sessionCookie = cookie;
      _lastAttempt = null;
      _sessionGeneration++;
      if (_retrying) {
        _retrying = false;
        notifyListeners();
      }
    }
    final local = day.toLocal();
    final key = DateTime(local.year, local.month, local.day);
    (nutrition ? _nutritionDays : _waterDays).add(key);
    _persist();
    _schedule();
  }

  void _schedule() {
    if (_running || (_nutritionDays.isEmpty && _waterDays.isEmpty)) return;
    _timer?.cancel();
    var delay = debounce;
    if (_lastAttempt != null) {
      final remaining = minInterval - _clock().difference(_lastAttempt!);
      if (remaining > delay) delay = remaining;
    }
    _timer = Timer(delay, () => unawaited(_flush()));
  }

  Future<void> _flush() async {
    if (_running) return;
    if (_sessionCookie != ApiClient.instance.sessionCookie) {
      _sessionCookie = ApiClient.instance.sessionCookie;
      _sessionGeneration++;
      _schedule();
      return;
    }
    final nutrition = Set<DateTime>.of(_nutritionDays);
    final water = Set<DateTime>.of(_waterDays);
    if (nutrition.isEmpty && water.isEmpty) return;
    _nutritionDays.clear();
    _waterDays.clear();
    _running = true;
    final generation = _sessionGeneration;
    _uploadingGeneration = generation;
    _uploadingNutrition.addAll(nutrition);
    _uploadingWater.addAll(water);
    _lastAttempt = _clock();
    try {
      await upload(nutrition, water);
      if (generation == _sessionGeneration) {
        _retrying = false;
        AppLogger.log(
          'HealthAutoSync',
          '已更新 ${nutrition.length} 天熱量、${water.length} 天飲水日總',
        );
        notifyListeners();
      }
    } catch (e) {
      if (generation == _sessionGeneration) {
        _nutritionDays.addAll(nutrition);
        _waterDays.addAll(water);
        _retrying = true;
        notifyListeners();
      }
      AppLogger.log('HealthAutoSync', '自動上傳失敗，稍後重試：$e');
    } finally {
      _uploadingNutrition.clear();
      _uploadingWater.clear();
      _uploadingGeneration = -1;
      _persist();
      _running = false;
      _schedule();
    }
  }

  @visibleForTesting
  @override
  void dispose() {
    _timer?.cancel();
    _nutritionDays.clear();
    _waterDays.clear();
    super.dispose();
  }
}
