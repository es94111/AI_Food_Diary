import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/screens/ai_activity_screen.dart';
import 'package:ai_food_mobile/theme/app_theme.dart';
import 'package:ai_food_mobile/widgets/ai_activity_settings_entry.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

AiActivityEvent _event() => AiActivityEvent.fromJson({
  'id': 'event-1',
  'createdAt': '2026-09-08T01:02:03.000Z',
  'user': {'id': 'user-1', 'name': '測試使用者', 'email': 'user@example.com'},
  'actorType': 'ai',
  'actorSource': 'chatgpt_mcp',
  'action': 'AI_CREATE_SUCCEEDED',
  'resourceType': 'meal',
  'resourceId': 'meal-1',
  'mcpToolName': 'create_meal',
  'requestId': 'request-1',
  'correlationId': 'correlation-1',
  'status': 'SUCCEEDED',
});

Widget _wrap(Widget home) => MaterialApp(theme: AppTheme.light(), home: home);

void main() {
  testWidgets('Settings entry opens AI Activity without adding a root tab', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(
        Scaffold(
          body: AiActivitySettingsEntry(
            destinationBuilder: (_) => const Scaffold(
              body: Center(child: Text('AI Activity destination')),
            ),
          ),
        ),
      ),
    );

    expect(find.text('AI 操作紀錄'), findsOneWidget);
    await tester.tap(find.text('AI 操作紀錄'));
    await tester.pumpAndSettle();

    expect(find.text('AI Activity destination'), findsOneWidget);
  });

  testWidgets('activity list navigates to server-backed conflict detail', (
    tester,
  ) async {
    final event = _event();
    await tester.pumpWidget(
      _wrap(
        AiActivityScreen(
          loadPage: (_) async => AiActivityPage(events: [event]),
          loadDetail: (_) async => AiActivityDetail(
            event: event,
            restorePreview: const AiRestorePreview(
              eligible: false,
              conflict: true,
              conflictReason: '資料已由使用者修改，不能直接還原。',
              currentState: {'revision': 2},
              afterRestoreState: {'revision': 1},
              expectedVersion: '2026-09-08T01:30:00.000Z',
            ),
          ),
          restoreAction: (_, {required reason, expectedVersion}) async {
            fail('conflicting restore must not be invoked');
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('AI 已建立資料'), findsOneWidget);
    expect(find.text('create_meal'), findsOneWidget);
    await tester.tap(find.text('AI 已建立資料'));
    await tester.pumpAndSettle();

    expect(find.text('AI 操作詳情'), findsOneWidget);
    final detailScrollable = find
        .descendant(
          of: find.byType(ListView).last,
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.text('資料已由使用者修改，不能直接還原。'),
      400,
      scrollable: detailScrollable,
    );
    expect(find.text('資料已由使用者修改，不能直接還原。'), findsOneWidget);
    expect(find.text('檢視並確認還原'), findsNothing);
  });

  testWidgets(
    'eligible restore confirms and forwards server resource version',
    (tester) async {
      final event = _event();
      var detailLoads = 0;
      String? submittedReason;
      String? submittedVersion;
      await tester.pumpWidget(
        _wrap(
          AiActivityScreen(
            loadPage: (_) async => AiActivityPage(events: [event]),
            loadDetail: (_) async {
              detailLoads += 1;
              return AiActivityDetail(
                event: detailLoads > 1
                    ? AiActivityEvent.fromJson({
                        'id': 'event-1',
                        'createdAt': '2026-09-08T01:02:03.000Z',
                        'actorType': 'ai',
                        'actorSource': 'chatgpt_mcp',
                        'action': 'AI_CREATE_SUCCEEDED',
                        'resourceType': 'meal',
                        'resourceId': 'meal-1',
                        'status': 'SUCCEEDED',
                        'isRestored': true,
                        'restoredAt': '2026-09-08T02:00:00.000Z',
                      })
                    : event,
                restorePreview: detailLoads > 1
                    ? null
                    : const AiRestorePreview(
                        eligible: true,
                        conflict: false,
                        currentState: {'version': 'current'},
                        afterRestoreState: {'version': 'restored'},
                        expectedVersion: '2026-09-08T01:30:00.000Z',
                      ),
              );
            },
            restoreAction: (_, {required reason, expectedVersion}) async {
              submittedReason = reason;
              submittedVersion = expectedVersion;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('AI 已建立資料'));
      await tester.pumpAndSettle();
      final detailScrollable = find
          .descendant(
            of: find.byType(ListView).last,
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('檢視並確認還原'),
        400,
        scrollable: detailScrollable,
      );
      await tester.tap(find.text('檢視並確認還原'));
      await tester.pumpAndSettle();

      expect(find.text('確認還原 AI 操作？'), findsOneWidget);
      expect(find.textContaining('current'), findsOneWidget);
      expect(find.textContaining('restored'), findsOneWidget);
      await tester.enterText(find.byType(TextField), '不再需要這筆 AI 新增資料');
      await tester.tap(find.text('確認還原'));
      await tester.pumpAndSettle();

      expect(submittedReason, '不再需要這筆 AI 新增資料');
      expect(submittedVersion, '2026-09-08T01:30:00.000Z');
      expect(find.textContaining('原始操作紀錄仍完整保留'), findsOneWidget);
    },
  );
}
