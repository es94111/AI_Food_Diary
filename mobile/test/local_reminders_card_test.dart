import 'package:ai_food_mobile/services/local_reminder_service.dart';
import 'package:ai_food_mobile/widgets/local_reminders_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('denied permission shows actionable guidance after enabling', (
    tester,
  ) async {
    final controller = _FakeReminderSettingsController();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: LocalRemindersCard(controller: controller)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('提醒我記錄餐點'), findsOneWidget);
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();

    expect(controller.settings.mealLogEnabled, isTrue);
    expect(find.textContaining('目前不會送達'), findsOneWidget);
    expect(find.text('開啟通知設定'), findsOneWidget);

    await tester.tap(find.text('開啟通知設定'));
    await tester.pumpAndSettle();
    expect(controller.settingsOpened, 1);
  });
}

class _FakeReminderSettingsController implements ReminderSettingsController {
  ReminderSettings settings = const ReminderSettings();
  int settingsOpened = 0;

  @override
  bool get supported => true;

  @override
  Future<ReminderSettings> loadSettings() async => settings;

  @override
  Future<bool?> notificationPermissionGranted() async => false;

  @override
  Future<bool?> requestNotificationPermission() async => false;

  @override
  Future<void> saveSettings(ReminderSettings next) async {
    settings = next;
  }

  @override
  Future<bool?> openNotificationSettings() async {
    settingsOpened++;
    return true;
  }

  @override
  Future<void> reconcile() async {}
}
