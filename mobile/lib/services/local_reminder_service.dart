import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'package:workmanager/workmanager.dart';

import '../utils/metabolism.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'daily_goal_summary.dart';
import 'daily_goal_summary_worker.dart';

const _reminderPreferencesKey = 'local_reminder_settings_v1';
const _dailyGoalSummaryScheduleKey = 'daily_goal_summary_schedule_v1';
const _reminderChannelId = dailyGoalSummaryChannelId;
const _reminderChannelName = dailyGoalSummaryChannelName;
const _reminderChannelDescription = '記錄、喝水與每日回顧提醒';
const _reminderTimeZoneChannel = MethodChannel('aifood.shao.one/reminders');

/// A local reminder the user can independently enable and time.
enum ReminderKind {
  mealLog(
    id: 2610,
    title: '飲食記錄小提醒',
    body: '如果方便，可以記下剛剛的一餐；也能稍後再補記。',
    defaultMinutes: 12 * 60 + 30,
  ),
  water(
    id: 2611,
    title: '喝水小提醒',
    body: '如果想喝水，可以記下今天的飲水量。',
    defaultMinutes: 15 * 60,
  ),
  dailyReview(id: dailyGoalSummaryNotificationId, defaultMinutes: 21 * 60);

  const ReminderKind({
    required this.id,
    this.title,
    this.body,
    required this.defaultMinutes,
  });

  /// These IDs are separate from background-analysis notification IDs 1900/1901.
  final int id;
  final String? title;
  final String? body;
  final int defaultMinutes;
}

/// User-controlled reminder preferences stored only on this device.
@immutable
class ReminderSettings {
  const ReminderSettings({
    this.mealLogEnabled = false,
    this.mealLogMinutes = 12 * 60 + 30,
    this.waterEnabled = false,
    this.waterMinutes = 15 * 60,
    this.dailyReviewEnabled = false,
    this.dailyReviewMinutes = 21 * 60,
  });

  final bool mealLogEnabled;
  final int mealLogMinutes;
  final bool waterEnabled;
  final int waterMinutes;
  final bool dailyReviewEnabled;
  final int dailyReviewMinutes;

  bool get anyEnabled => mealLogEnabled || waterEnabled || dailyReviewEnabled;

  bool enabledFor(ReminderKind kind) => switch (kind) {
    ReminderKind.mealLog => mealLogEnabled,
    ReminderKind.water => waterEnabled,
    ReminderKind.dailyReview => dailyReviewEnabled,
  };

  int minutesFor(ReminderKind kind) => switch (kind) {
    ReminderKind.mealLog => mealLogMinutes,
    ReminderKind.water => waterMinutes,
    ReminderKind.dailyReview => dailyReviewMinutes,
  };

  ReminderSettings withEnabled(ReminderKind kind, bool enabled) =>
      ReminderSettings(
        mealLogEnabled: kind == ReminderKind.mealLog ? enabled : mealLogEnabled,
        mealLogMinutes: mealLogMinutes,
        waterEnabled: kind == ReminderKind.water ? enabled : waterEnabled,
        waterMinutes: waterMinutes,
        dailyReviewEnabled: kind == ReminderKind.dailyReview
            ? enabled
            : dailyReviewEnabled,
        dailyReviewMinutes: dailyReviewMinutes,
      );

  ReminderSettings withMinutes(ReminderKind kind, int minutes) {
    final value = minutes.clamp(0, 1439);
    return ReminderSettings(
      mealLogEnabled: mealLogEnabled,
      mealLogMinutes: kind == ReminderKind.mealLog ? value : mealLogMinutes,
      waterEnabled: waterEnabled,
      waterMinutes: kind == ReminderKind.water ? value : waterMinutes,
      dailyReviewEnabled: dailyReviewEnabled,
      dailyReviewMinutes: kind == ReminderKind.dailyReview
          ? value
          : dailyReviewMinutes,
    );
  }

  Map<String, Object> toJson() => {
    'mealLogEnabled': mealLogEnabled,
    'mealLogMinutes': mealLogMinutes,
    'waterEnabled': waterEnabled,
    'waterMinutes': waterMinutes,
    'dailyReviewEnabled': dailyReviewEnabled,
    'dailyReviewMinutes': dailyReviewMinutes,
  };

  factory ReminderSettings.fromJson(Map<String, dynamic> json) {
    bool readBool(String key) => json[key] == true;
    int readMinutes(String key, int fallback) {
      final value = json[key];
      if (value is! int || value < 0 || value > 1439) return fallback;
      return value;
    }

    return ReminderSettings(
      mealLogEnabled: readBool('mealLogEnabled'),
      mealLogMinutes: readMinutes(
        'mealLogMinutes',
        ReminderKind.mealLog.defaultMinutes,
      ),
      waterEnabled: readBool('waterEnabled'),
      waterMinutes: readMinutes(
        'waterMinutes',
        ReminderKind.water.defaultMinutes,
      ),
      dailyReviewEnabled: readBool('dailyReviewEnabled'),
      dailyReviewMinutes: readMinutes(
        'dailyReviewMinutes',
        ReminderKind.dailyReview.defaultMinutes,
      ),
    );
  }
}

/// A notification occurrence planned for the user's current local timezone.
@immutable
class ReminderOccurrence {
  const ReminderOccurrence({required this.kind, required this.scheduledAt});

  final ReminderKind kind;
  final tz.TZDateTime scheduledAt;

  int get id => kind.id;
  String? get title => kind.title;
  String? get body => kind.body;
}

/// Pure planner for one repeating local-time reminder.
class ReminderSchedulePlanner {
  static ReminderOccurrence nextDailyOccurrence({
    required ReminderKind kind,
    required int minutesAfterMidnight,
    required DateTime now,
    required tz.Location location,
  }) {
    final localNow = tz.TZDateTime.from(now, location);
    final hour = minutesAfterMidnight ~/ 60;
    final minute = minutesAfterMidnight % 60;
    var scheduledAt = tz.TZDateTime(
      location,
      localNow.year,
      localNow.month,
      localNow.day,
      hour,
      minute,
    );
    if (!scheduledAt.isAfter(localNow)) {
      scheduledAt = tz.TZDateTime(
        location,
        localNow.year,
        localNow.month,
        localNow.day + 1,
        hour,
        minute,
      );
    }
    return ReminderOccurrence(kind: kind, scheduledAt: scheduledAt);
  }
}

abstract interface class ReminderSettingsController {
  bool get supported;

  Future<ReminderSettings> loadSettings();
  Future<bool?> notificationPermissionGranted();
  Future<bool?> requestNotificationPermission();
  Future<void> saveSettings(ReminderSettings settings);
  Future<bool?> openNotificationSettings();
  Future<void> reconcile();
}

abstract interface class ReminderNotificationClient {
  Future<void> initialize();
  Future<bool?> areNotificationsEnabled();
  Future<bool?> requestNotificationsPermission();
  Future<bool?> openAppNotificationSettings();
  Future<void> schedule(ReminderOccurrence occurrence);
  Future<void> cancel(int id);
}

abstract interface class DailyGoalSummaryScheduler {
  Future<void> schedule({
    required Duration initialDelay,
    required Map<String, dynamic> inputData,
    required bool replaceExisting,
  });
  Future<void> cancel();
}

class LocalReminderService implements ReminderSettingsController {
  LocalReminderService({
    ReminderNotificationClient? notifications,
    DailyGoalSummaryScheduler? dailyGoalSummaryScheduler,
    Future<String> Function()? localTimeZoneId,
    Future<String?> Function()? sessionCookie,
    Future<DailyGoalProgress?> Function(DateTime day)? cachedGoalProgress,
    bool? supported,
  }) : _notifications = notifications ?? _FlutterReminderNotificationClient(),
       _dailyGoalSummaryScheduler =
           dailyGoalSummaryScheduler ?? _WorkManagerDailyGoalSummaryScheduler(),
       _localTimeZoneId = localTimeZoneId ?? _readLocalTimeZoneId,
       _sessionCookie = sessionCookie ?? _readSessionCookie,
       _cachedGoalProgress = cachedGoalProgress ?? _readCachedGoalProgress,
       _supported = supported ?? (!kIsWeb && Platform.isAndroid);

  static final instance = LocalReminderService();

  final ReminderNotificationClient _notifications;
  final DailyGoalSummaryScheduler _dailyGoalSummaryScheduler;
  final Future<String> Function() _localTimeZoneId;
  final Future<String?> Function() _sessionCookie;
  final Future<DailyGoalProgress?> Function(DateTime day) _cachedGoalProgress;
  final bool _supported;
  Future<void>? _initializing;
  bool _initialized = false;
  Future<void> _operationQueue = Future<void>.value();

  @override
  bool get supported => _supported;

  /// Initializes the separate reminder channel and restores saved schedules.
  Future<void> init() => reconcile();

  @override
  Future<ReminderSettings> loadSettings() async {
    if (!supported) return const ReminderSettings();
    final prefs = await SharedPreferences.getInstance();
    final encoded = prefs.getString(_reminderPreferencesKey);
    if (encoded == null) return const ReminderSettings();
    try {
      final json = jsonDecode(encoded);
      if (json is! Map<String, dynamic>) return const ReminderSettings();
      return ReminderSettings.fromJson(json);
    } on FormatException {
      return const ReminderSettings();
    }
  }

  @override
  Future<bool?> notificationPermissionGranted() async {
    if (!supported) return false;
    await _ensureInitialized();
    return _notifications.areNotificationsEnabled();
  }

  @override
  Future<bool?> requestNotificationPermission() async {
    if (!supported) return false;
    await _ensureInitialized();
    await _notifications.requestNotificationsPermission();
    return _notifications.areNotificationsEnabled();
  }

  @override
  Future<bool?> openNotificationSettings() async {
    if (!supported) return false;
    await _ensureInitialized();
    return _notifications.openAppNotificationSettings();
  }

  @override
  Future<void> saveSettings(ReminderSettings settings) async {
    if (!supported) return;
    await _serialize(() async {
      await _ensureInitialized();
      final prefs = await SharedPreferences.getInstance();
      final saved = await prefs.setString(
        _reminderPreferencesKey,
        jsonEncode(settings.toJson()),
      );
      if (!saved) throw StateError('Could not persist reminder settings.');
      await _reconcileSettings(settings);
    });
  }

  @override
  Future<void> reconcile() async {
    if (!supported) return;
    await _serialize(() async {
      await _ensureInitialized();
      await _reconcileSettings(await loadSettings());
    });
  }

  /// Cancels only the data-backed daily task when the account is signed out.
  Future<void> cancelDailyGoalSummary() async {
    if (!supported) return;
    await _serialize(() async {
      await _cancelDailyGoalTask();
      await _notifications.cancel(ReminderKind.dailyReview.id);
    });
  }

  Future<void> _reconcileSettings(ReminderSettings settings) async {
    final permissionGranted =
        await _notifications.areNotificationsEnabled() == true;
    if (!permissionGranted) {
      for (final kind in ReminderKind.values) {
        await _notifications.cancel(kind.id);
      }
      await _cancelDailyGoalTask();
      return;
    }

    final location = await _loadLocalLocation();
    final now = DateTime.now();
    for (final kind in [ReminderKind.mealLog, ReminderKind.water]) {
      if (!settings.enabledFor(kind)) {
        await _notifications.cancel(kind.id);
        continue;
      }
      await _notifications.schedule(
        ReminderSchedulePlanner.nextDailyOccurrence(
          kind: kind,
          minutesAfterMidnight: settings.minutesFor(kind),
          now: now,
          location: location,
        ),
      );
    }

    if (settings.dailyReviewEnabled) {
      await _scheduleDailyGoalSummary(settings, now, location);
    } else {
      await _cancelDailyGoalTask();
      await _notifications.cancel(ReminderKind.dailyReview.id);
    }
  }

  Future<void> _scheduleDailyGoalSummary(
    ReminderSettings settings,
    DateTime now,
    tz.Location location,
  ) async {
    final cookie = await _sessionCookie();
    if (cookie == null || cookie.isEmpty) {
      await _cancelDailyGoalTask();
      await _notifications.cancel(ReminderKind.dailyReview.id);
      return;
    }

    final occurrence = ReminderSchedulePlanner.nextDailyOccurrence(
      kind: ReminderKind.dailyReview,
      minutesAfterMidnight: settings.dailyReviewMinutes,
      now: now,
      location: location,
    );
    DailyGoalProgress? cachedProgress;
    try {
      cachedProgress = await _cachedGoalProgress(now);
    } catch (_) {
      cachedProgress = null;
    }
    final localNow = tz.TZDateTime.now(location);
    final scheduleKey =
        '${settings.dailyReviewMinutes}:${location.name}:${localNow.timeZoneOffset.inMinutes}';
    final prefs = await SharedPreferences.getInstance();
    final replaceExisting =
        prefs.getString(_dailyGoalSummaryScheduleKey) != scheduleKey;
    await _dailyGoalSummaryScheduler.schedule(
      initialDelay: occurrence.scheduledAt.difference(localNow),
      inputData: {
        'baseUrl': ApiClient.baseUrl,
        'cookie': cookie,
        'cachedProgress': cachedProgress == null
            ? ''
            : jsonEncode(cachedProgress.toJson()),
      },
      replaceExisting: replaceExisting,
    );
    await prefs.setString(_dailyGoalSummaryScheduleKey, scheduleKey);
  }

  Future<void> _cancelDailyGoalTask() async {
    await _dailyGoalSummaryScheduler.cancel();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_dailyGoalSummaryScheduleKey);
  }

  static Future<String?> _readSessionCookie() async {
    await ApiClient.instance.hasSession();
    return ApiClient.instance.sessionCookie;
  }

  static Future<DailyGoalProgress?> _readCachedGoalProgress(
    DateTime day,
  ) async {
    final user = await AuthService.cachedMe();
    if (user == null) return null;
    final query = {
      'date': isoDate(day),
      'tzOffset': '${localTzOffsetMinutes()}',
    };
    final meals = await ApiClient.instance.cached('/api/meals', query: query);
    final water = await ApiClient.instance.cached('/api/water', query: query);
    if (meals is! Map<String, dynamic> || water is! Map<String, dynamic>) {
      return null;
    }
    final calorieTarget = metabolismFor(user.profile).target;
    final waterGoalMl = user.profile?.waterGoalMl ?? 2000;
    return DailyGoalProgress.fromApiResponses(
      date: isoDate(day),
      userResponse: {
        'user': {
          'profile': {
            'calorieTarget': calorieTarget,
            'waterGoalMl': waterGoalMl,
          },
        },
      },
      mealsResponse: meals,
      waterResponse: water,
    );
  }

  Future<tz.Location> _loadLocalLocation() async {
    tz_data.initializeTimeZones();
    final timeZoneId = await _localTimeZoneId();
    try {
      return tz.getLocation(timeZoneId);
    } on Exception {
      throw StateError('Unsupported local timezone: $timeZoneId');
    }
  }

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    final initializing = _initializing;
    if (initializing != null) {
      await initializing;
      return;
    }
    final future = _notifications.initialize();
    _initializing = future;
    try {
      await future;
      _initialized = true;
    } finally {
      if (identical(_initializing, future)) _initializing = null;
    }
  }

  Future<T> _serialize<T>(Future<T> Function() operation) {
    final result = _operationQueue.then((_) => operation());
    _operationQueue = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return result;
  }

  static Future<String> _readLocalTimeZoneId() async {
    final id = await _reminderTimeZoneChannel.invokeMethod<String>(
      'getLocalTimeZone',
    );
    if (id == null || id.isEmpty) {
      throw StateError('The device did not provide a local timezone.');
    }
    return id;
  }
}

class _FlutterReminderNotificationClient implements ReminderNotificationClient {
  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  @override
  Future<void> initialize() async {
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    await _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            _reminderChannelId,
            _reminderChannelName,
            description: _reminderChannelDescription,
            importance: Importance.defaultImportance,
          ),
        );
  }

  @override
  Future<bool?> areNotificationsEnabled() async =>
      await _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.areNotificationsEnabled() ??
      false;

  @override
  Future<bool?> requestNotificationsPermission() async =>
      await _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission() ??
      false;

  @override
  Future<bool?> openAppNotificationSettings() async =>
      await _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.openAppNotificationSettings() ??
      false;

  @override
  Future<void> schedule(ReminderOccurrence occurrence) => _plugin.zonedSchedule(
    id: occurrence.id,
    title: occurrence.title,
    body: occurrence.body,
    scheduledDate: occurrence.scheduledAt,
    notificationDetails: const NotificationDetails(
      android: AndroidNotificationDetails(
        _reminderChannelId,
        _reminderChannelName,
        channelDescription: _reminderChannelDescription,
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
    ),
    androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    matchDateTimeComponents: DateTimeComponents.time,
    payload: 'local_reminder:${occurrence.kind.name}',
  );

  @override
  Future<void> cancel(int id) => _plugin.cancel(id: id);
}

class _WorkManagerDailyGoalSummaryScheduler
    implements DailyGoalSummaryScheduler {
  @override
  Future<void> schedule({
    required Duration initialDelay,
    required Map<String, dynamic> inputData,
    required bool replaceExisting,
  }) => Workmanager().registerPeriodicTask(
    dailyGoalSummaryTaskName,
    dailyGoalSummaryTaskName,
    frequency: const Duration(days: 1),
    flexInterval: const Duration(minutes: 15),
    initialDelay: initialDelay,
    inputData: inputData,
    existingWorkPolicy: replaceExisting
        ? ExistingPeriodicWorkPolicy.replace
        : ExistingPeriodicWorkPolicy.update,
  );

  @override
  Future<void> cancel() =>
      Workmanager().cancelByUniqueName(dailyGoalSummaryTaskName);
}
