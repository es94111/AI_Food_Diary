import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:ai_food_mobile/services/api_client.dart';
import 'package:ai_food_mobile/services/health_auto_sync.dart';
import 'package:ai_food_mobile/services/health_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final ResponseBody Function(RequestOptions) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object data) => ResponseBody.fromString(
  jsonEncode(data),
  200,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

void main() {
  setUp(() => ApiClient.instance.debugResetForTesting());
  tearDown(() => ApiClient.instance.debugResetForTesting());

  test(
    'deleting the last meal and water log uploads zero for that day',
    () async {
      final adapter = _Adapter((options) {
        if (options.path == '/api/meals') return _json({'meals': []});
        if (options.path == '/api/water') {
          return _json({'logs': [], 'totalMl': 0});
        }
        if (options.path == '/api/health/sync') return _json({'synced': 2});
        throw StateError('Unexpected ${options.path}');
      });
      ApiClient.instance.debugSetDioForTesting(
        Dio(BaseOptions(baseUrl: ApiClient.baseUrl))
          ..httpClientAdapter = adapter,
      );

      final day = DateTime(2026, 9, 25, 17);
      await HealthService.syncAppDataForDays(
        nutritionDays: {day},
        waterDays: {day},
      );

      final post = adapter.requests.singleWhere(
        (request) => request.path == '/api/health/sync',
      );
      final body = post.data as Map<String, dynamic>;
      expect(body['source'], 'HEALTH_CONNECT');
      final metrics = (body['metrics'] as List).cast<Map<String, dynamic>>();
      expect(metrics.map((metric) => metric['type']).toSet(), {
        'NUTRITION',
        'WATER',
      });
      expect(metrics.every((metric) => metric['value'] == 0), isTrue);
      expect(adapter.requests.where((r) => r.method == 'GET').length, 2);
    },
  );

  test('changed meal calories upload a fresh daily total', () async {
    final adapter = _Adapter((options) {
      if (options.path == '/api/meals') {
        return _json({
          'meals': [
            {
              'id': 'meal-1',
              'totalCalories': 320.5,
              'eatenAt': '2026-09-25T04:00:00Z',
            },
            {
              'id': 'meal-2',
              'totalCalories': 200,
              'eatenAt': '2026-09-25T12:00:00Z',
            },
          ],
        });
      }
      if (options.path == '/api/health/sync') return _json({'synced': 1});
      throw StateError('Unexpected ${options.path}');
    });
    ApiClient.instance.debugSetDioForTesting(
      Dio(BaseOptions(baseUrl: ApiClient.baseUrl))..httpClientAdapter = adapter,
    );

    await HealthService.syncAppDataForDays(
      nutritionDays: {DateTime(2026, 9, 25)},
    );

    final post = adapter.requests.singleWhere(
      (request) => request.path == '/api/health/sync',
    );
    final metric = ((post.data as Map)['metrics'] as List).single as Map;
    expect(metric['type'], 'NUTRITION');
    expect(metric['value'], 521);
    expect(adapter.requests.where((r) => r.path == '/api/water'), isEmpty);
  });

  testWidgets('rapid meal and water edits share one upload', (tester) async {
    final batches = <(Set<DateTime>, Set<DateTime>)>[];
    final queue = HealthAutoSync(
      debounce: const Duration(milliseconds: 100),
      minInterval: Duration.zero,
      upload: (nutrition, water) async {
        batches.add((Set.of(nutrition), Set.of(water)));
      },
    );
    final day = DateTime(2026, 9, 25, 18);
    queue.nutritionChanged(day);
    queue.nutritionChanged(day);
    queue.waterChanged(day);
    await tester.pump(const Duration(milliseconds: 101));

    expect(batches.length, 1);
    expect(batches.single.$1, {DateTime(2026, 9, 25)});
    expect(batches.single.$2, {DateTime(2026, 9, 25)});
    queue.dispose();
  });

  testWidgets('an edit during upload is sent in a second batch', (
    tester,
  ) async {
    final first = Completer<void>();
    final batches = <(Set<DateTime>, Set<DateTime>)>[];
    final queue = HealthAutoSync(
      debounce: const Duration(milliseconds: 100),
      minInterval: Duration.zero,
      upload: (nutrition, water) async {
        batches.add((Set.of(nutrition), Set.of(water)));
        if (batches.length == 1) await first.future;
      },
    );
    final day = DateTime(2026, 9, 25);
    queue.nutritionChanged(day);
    await tester.pump(const Duration(milliseconds: 101));
    queue.waterChanged(day);
    first.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 101));

    expect(batches.length, 2);
    expect(batches[0].$1, {day});
    expect(batches[1].$2, {day});
    queue.dispose();
  });

  testWidgets('uploads are spaced to respect the server rate limit', (
    tester,
  ) async {
    final batches = <Set<DateTime>>[];
    final now = DateTime(2026, 9, 25, 12);
    final queue = HealthAutoSync(
      debounce: const Duration(milliseconds: 100),
      minInterval: const Duration(minutes: 2),
      clock: () => now,
      upload: (nutrition, _) async => batches.add(Set.of(nutrition)),
    );
    final day = DateTime(2026, 9, 25);
    queue.nutritionChanged(day);
    await tester.pump(const Duration(milliseconds: 101));
    queue.nutritionChanged(day);
    await tester.pump(const Duration(minutes: 1));
    expect(batches.length, 1);
    await tester.pump(const Duration(minutes: 1));
    expect(batches.length, 2);
    queue.dispose();
  });

  testWidgets('older pending days resume after restart for the same account', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final day = DateTime(2026, 9, 10);
    final first = HealthAutoSync(
      persistPending: true,
      debounce: const Duration(hours: 1),
      upload: (_, _) async {},
    );
    await first.activateForUser('account-a');
    first.nutritionChanged(day);
    await first.pendingWrite;
    first.dispose();

    final wrongAccountUploads = <Set<DateTime>>[];
    final wrongAccount = HealthAutoSync(
      persistPending: true,
      debounce: const Duration(milliseconds: 100),
      upload: (nutrition, _) async =>
          wrongAccountUploads.add(Set.of(nutrition)),
    );
    await wrongAccount.activateForUser('account-b');
    await tester.pump(const Duration(milliseconds: 101));
    expect(wrongAccountUploads, isEmpty);
    wrongAccount.dispose();

    final resumed = <Set<DateTime>>[];
    final second = HealthAutoSync(
      persistPending: true,
      debounce: const Duration(milliseconds: 100),
      upload: (nutrition, _) async => resumed.add(Set.of(nutrition)),
    );
    await second.activateForUser('account-a');
    await tester.pump(const Duration(milliseconds: 101));
    expect(resumed, [
      {day},
    ]);
    await second.pendingWrite;
    second.dispose();
  });

  testWidgets('stored queue keeps edits made during an unfinished upload',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final firstUpload = Completer<void>();
    var uploads = 0;
    final queue = HealthAutoSync(
      persistPending: true,
      debounce: const Duration(milliseconds: 100),
      minInterval: Duration.zero,
      upload: (_, _) async {
        uploads++;
        if (uploads == 1) await firstUpload.future;
      },
    );
    await queue.activateForUser('account-a');
    queue.nutritionChanged(DateTime(2026, 9, 10));
    await tester.pump(const Duration(milliseconds: 101));
    queue.waterChanged(DateTime(2026, 9, 11));
    await queue.pendingWrite;

    final prefs = await SharedPreferences.getInstance();
    final stored = jsonDecode(prefs.getString(
        'health_auto_sync_pending_account-a')!) as Map<String, dynamic>;
    expect(stored['nutrition'], ['2026-09-10T00:00:00.000']);
    expect(stored['water'], ['2026-09-11T00:00:00.000']);

    firstUpload.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 101));
    await queue.pendingWrite;
    final after = jsonDecode(prefs.getString(
        'health_auto_sync_pending_account-a')!) as Map<String, dynamic>;
    expect(after['nutrition'], isEmpty);
    expect(after['water'], isEmpty);
    queue.dispose();
  });

  testWidgets('failed upload is retained and retried', (tester) async {
    var attempts = 0;
    final queue = HealthAutoSync(
      debounce: const Duration(milliseconds: 100),
      minInterval: Duration.zero,
      upload: (_, _) async {
        attempts++;
        if (attempts == 1) throw StateError('network unavailable');
      },
    );
    queue.waterChanged(DateTime(2026, 9, 25));
    await tester.pump(const Duration(milliseconds: 101));
    expect(queue.retrying, isTrue);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 101));

    expect(attempts, 2);
    expect(queue.retrying, isFalse);
    queue.dispose();
  });
}
