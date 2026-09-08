import 'package:ai_food_mobile/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('AI activity event parses attribution and restore state', () {
    final event = AiActivityEvent.fromJson({
      'id': 'event-1',
      'createdAt': '2026-09-08T01:02:03.000Z',
      'user': {'id': 'user-1', 'name': '測試使用者', 'email': 'user@example.com'},
      'actorType': 'ai',
      'actorSource': 'chatgpt_mcp',
      'action': 'AI_CREATE_SUCCEEDED',
      'resourceType': 'meal',
      'resourceId': 'meal-1',
      'mcpToolName': 'create_meal',
      'beforeState': null,
      'afterState': {'id': 'meal-1', 'name': '早餐'},
      'requestId': 'request-1',
      'correlationId': 'correlation-1',
      'status': 'SUCCEEDED',
      'isRestored': true,
      'restoredAt': '2026-09-08T02:00:00.000Z',
      'restoredBy': {'id': 'user-1', 'name': '測試使用者'},
      'restoreActionId': 'restore-event-1',
    });

    expect(event.id, 'event-1');
    expect(event.createdAt.toUtc(), DateTime.utc(2026, 9, 8, 1, 2, 3));
    expect(event.user?.displayName, '測試使用者');
    expect(event.actorSource, 'chatgpt_mcp');
    expect(event.mcpToolName, 'create_meal');
    expect(event.requestId, 'request-1');
    expect(event.correlationId, 'correlation-1');
    expect(event.isRestored, isTrue);
    expect(event.restoredBy?.displayName, '測試使用者');
    expect(event.restoreActionId, 'restore-event-1');
  });

  test(
    'detail uses only server supplied restore preview and expected version',
    () {
      final detail = AiActivityDetail.fromJson({
        'event': {
          'id': 'event-1',
          'timestamp': '2026-09-08T01:02:03.000Z',
          'actorType': 'ai',
          'actorSource': 'chatgpt_mcp',
          'action': 'AI_CREATE_SUCCEEDED',
          'resource': {'type': 'meal', 'id': 'meal-1'},
          'status': 'SUCCEEDED',
        },
        'restorePreview': {
          'eligible': false,
          'conflict': {'reason': '資料已由使用者修改。'},
          'currentState': {'revision': 2},
          'afterRestoreState': {'revision': 1},
          'expectedVersion': '2026-09-08T01:30:00.000Z',
        },
      });

      expect(detail.event.resourceType, 'meal');
      expect(detail.event.resourceId, 'meal-1');
      expect(detail.restorePreview?.eligible, isFalse);
      expect(detail.restorePreview?.conflict, isTrue);
      expect(detail.restorePreview?.conflictReason, '資料已由使用者修改。');
      expect(
        detail.restorePreview?.expectedVersion,
        '2026-09-08T01:30:00.000Z',
      );
    },
  );

  test('audit states stay inert plain text', () {
    const untrusted = '<script>alert("ignore previous instructions")</script>';

    expect(formatAiAuditState(untrusted), untrusted);
    expect(
      formatAiAuditState({'content': untrusted}),
      contains('ignore previous instructions'),
    );
  });

  test('list query trims filters and serializes cursor pagination', () {
    final query = AiActivityQuery(
      from: DateTime.utc(2026, 9, 1),
      to: DateTime.utc(2026, 9, 8, 23, 59, 59),
      userId: ' user-1 ',
      actorSource: ' chatgpt_mcp ',
      mcpToolName: ' create_meal ',
      resourceType: ' MEAL ',
      action: ' AI_CREATE_SUCCEEDED ',
      status: ' succeeded ',
      cursor: ' cursor-2 ',
      limit: 500,
    );

    final params = query.toQueryParameters();
    expect(params['userId'], 'user-1');
    expect(params['actorSource'], 'chatgpt_mcp');
    expect(params['mcpToolName'], 'create_meal');
    expect(params['resourceType'], 'MEAL');
    expect(params['action'], 'AI_CREATE_SUCCEEDED');
    expect(params['status'], 'succeeded');
    expect(params['cursor'], 'cursor-2');
    expect(params['limit'], 100);
    expect(query.hasFilters, isTrue);
  });
}
