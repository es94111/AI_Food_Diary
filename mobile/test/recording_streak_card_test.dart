import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/widgets/recording_streak_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget app(RecordingStreak? streak, {bool isLoading = false}) => MaterialApp(
    home: Scaffold(
      body: RecordingStreakCard(streak: streak, isLoading: isLoading),
    ),
  );

  testWidgets('shows current, longest, and last recorded values', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        const RecordingStreak(
          currentStreak: 4,
          longestStreak: 9,
          lastRecordedDate: '2026-10-07',
        ),
      ),
    );

    expect(find.text('目前連續天數'), findsOneWidget);
    expect(find.text('最長連續天數'), findsOneWidget);
    expect(find.text('最近一次記錄'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('9'), findsOneWidget);
    expect(find.text('2026-10-07'), findsOneWidget);
    expect(find.text('目前已連續記錄 4 天，照自己的節奏繼續就好。'), findsOneWidget);
  });

  testWidgets('uses non-judgmental copy for an empty streak', (tester) async {
    await tester.pumpWidget(
      app(
        const RecordingStreak(
          currentStreak: 0,
          longestStreak: 0,
          lastRecordedDate: null,
        ),
      ),
    );

    expect(find.text('每一天都可以從一筆餐點或飲水紀錄開始。'), findsOneWidget);
  });

  testWidgets('preserves a calm restart message after a broken streak', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        const RecordingStreak(
          currentStreak: 0,
          longestStreak: 5,
          lastRecordedDate: '2026-10-03',
        ),
      ),
    );

    expect(find.textContaining('想繼續時，從一筆餐點或飲水開始就好。'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
  });

  testWidgets('shows a loading state before streak data arrives', (
    tester,
  ) async {
    await tester.pumpWidget(app(null, isLoading: true));

    expect(find.text('正在載入連續記錄…'), findsOneWidget);
  });

  testWidgets('shows a clear message when streak data is unavailable', (
    tester,
  ) async {
    await tester.pumpWidget(app(null));

    expect(find.text('連續記錄目前無法載入，可以稍後再試。'), findsOneWidget);
  });
}
