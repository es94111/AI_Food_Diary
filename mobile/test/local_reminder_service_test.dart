import 'package:ai_food_mobile/services/local_reminder_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    tz_data.initializeTimeZones();
  });

  test('settings default to off and round-trip valid reminder times', () {
    const defaults = ReminderSettings();
    expect(defaults.anyEnabled, isFalse);
    expect(defaults.mealLogMinutes, 12 * 60 + 30);

    final settings = defaults
        .withEnabled(ReminderKind.water, true)
        .withMinutes(ReminderKind.water, 18 * 60 + 15);
    final restored = ReminderSettings.fromJson(settings.toJson());

    expect(restored.enabledFor(ReminderKind.water), isTrue);
    expect(restored.minutesFor(ReminderKind.water), 18 * 60 + 15);
    expect(restored.enabledFor(ReminderKind.mealLog), isFalse);
  });

  test('planner uses the next local day and keeps the reminder ID stable', () {
    final location = tz.getLocation('Asia/Taipei');
    final now = tz.TZDateTime(location, 2026, 10, 7, 12, 30);
    final occurrence = ReminderSchedulePlanner.nextDailyOccurrence(
      kind: ReminderKind.mealLog,
      minutesAfterMidnight: 12 * 60 + 30,
      now: now,
      location: location,
    );

    expect(occurrence.scheduledAt.day, 8);
    expect(occurrence.scheduledAt.hour, 12);
    expect(occurrence.scheduledAt.minute, 30);
    expect(occurrence.id, ReminderKind.mealLog.id);
  });

  test(
    'repeated reconciliation replaces a reminder by its stable ID',
    () async {
      final notifications = _FakeReminderNotifications()..enabled = true;
      final service = LocalReminderService(
        notifications: notifications,
        localTimeZoneId: () async => 'Asia/Taipei',
        supported: true,
      );
      final settings = const ReminderSettings()
          .withEnabled(ReminderKind.mealLog, true)
          .withEnabled(ReminderKind.water, true);

      await service.saveSettings(settings);
      await service.saveSettings(
        settings.withMinutes(ReminderKind.mealLog, 13 * 60),
      );

      expect(notifications.initializeCalls, 1);
      expect(notifications.scheduled.keys, {
        ReminderKind.mealLog.id,
        ReminderKind.water.id,
      });
      expect(
        notifications.scheduleCalls
            .where((id) => id == ReminderKind.mealLog.id)
            .length,
        2,
      );
      expect(
        notifications.scheduled[ReminderKind.mealLog.id]!.scheduledAt.hour,
        13,
      );
      expect(
        (await service.loadSettings()).minutesFor(ReminderKind.mealLog),
        13 * 60,
      );
    },
  );

  test('concurrent updates leave the last requested schedule active', () async {
    final notifications = _FakeReminderNotifications()..enabled = true;
    final service = LocalReminderService(
      notifications: notifications,
      localTimeZoneId: () async => 'Asia/Taipei',
      supported: true,
    );
    await service.notificationPermissionGranted();

    final earlier = const ReminderSettings()
        .withEnabled(ReminderKind.mealLog, true)
        .withMinutes(ReminderKind.mealLog, 12 * 60);
    final later = earlier.withMinutes(ReminderKind.mealLog, 14 * 60);
    await Future.wait([
      service.saveSettings(earlier),
      service.saveSettings(later),
    ]);

    expect(
      (await service.loadSettings()).minutesFor(ReminderKind.mealLog),
      14 * 60,
    );
    expect(
      notifications.scheduled[ReminderKind.mealLog.id]!.scheduledAt.hour,
      14,
    );
    expect(notifications.scheduled.keys, {ReminderKind.mealLog.id});
  });

  test(
    'daily review remains generic when sign-out cancellation fails',
    () async {
      final notifications = _FakeReminderNotifications()..enabled = true;
      final service = LocalReminderService(
        notifications: notifications,
        localTimeZoneId: () async => 'Asia/Taipei',
        supported: true,
      );
      await service.saveSettings(
        const ReminderSettings().withEnabled(ReminderKind.dailyReview, true),
      );

      final reminder = notifications.scheduled[ReminderKind.dailyReview.id]!;
      expect(reminder.title, '每日回顧小提醒');
      expect(reminder.body, contains('回顧今天'));
      expect(reminder.body, isNot(contains('kcal')));
      expect(reminder.body, isNot(contains('ml')));

      notifications.failCancel = true;
      await expectLater(
        service.cancelRemindersOnSignOut(),
        throwsA(isA<StateError>()),
      );
      expect(
        notifications.scheduled[ReminderKind.dailyReview.id]!.body,
        reminder.body,
      );
      expect(notifications.scheduled.values, hasLength(1));
    },
  );

  test(
    'denied notification permission cancels schedules until permission returns',
    () async {
      final notifications = _FakeReminderNotifications();
      final service = LocalReminderService(
        notifications: notifications,
        localTimeZoneId: () async => 'Asia/Taipei',
        supported: true,
      );
      final settings = const ReminderSettings().withEnabled(
        ReminderKind.dailyReview,
        true,
      );

      await service.saveSettings(settings);
      expect(await service.notificationPermissionGranted(), isFalse);
      expect(notifications.scheduled, isEmpty);
      expect(notifications.cancelled, contains(ReminderKind.dailyReview.id));

      notifications.enabled = true;
      await service.reconcile();
      expect(notifications.scheduled.keys, {ReminderKind.dailyReview.id});
    },
  );
}

class _FakeReminderNotifications implements ReminderNotificationClient {
  bool enabled = false;
  bool failCancel = false;
  int initializeCalls = 0;
  final Map<int, ReminderOccurrence> scheduled = {};
  final List<int> scheduleCalls = [];
  final Set<int> cancelled = {};

  @override
  Future<void> initialize() async {
    initializeCalls++;
  }

  @override
  Future<bool?> areNotificationsEnabled() async => enabled;

  @override
  Future<bool?> requestNotificationsPermission() async => enabled;

  @override
  Future<bool?> openAppNotificationSettings() async => true;

  @override
  Future<void> schedule(ReminderOccurrence occurrence) async {
    scheduleCalls.add(occurrence.id);
    scheduled[occurrence.id] = occurrence;
    cancelled.remove(occurrence.id);
  }

  @override
  Future<void> cancel(int id) async {
    if (failCancel) throw StateError('cancel failed');
    scheduled.remove(id);
    cancelled.add(id);
  }
}
