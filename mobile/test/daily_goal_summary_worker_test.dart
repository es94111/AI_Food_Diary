import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:ai_food_mobile/services/daily_goal_summary.dart';
import 'package:ai_food_mobile/services/daily_goal_summary_worker.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'fetches the current local-day data and posts the measured goal summary',
    () async {
      final adapter = _FakeAdapter((options) {
        expect(options.headers['Cookie'], 'food_diary_session=example');
        if (options.path != '/api/me') {
          expect(options.queryParameters['date'], '2026-10-07');
        }
        return _jsonBody(switch (options.path) {
          '/api/me' => {
            'user': {
              'profile': {'calorieTarget': 2000, 'waterGoalMl': 2000},
            },
          },
          '/api/meals' => {
            'meals': [
              {'totalCalories': 900},
              {'totalCalories': 700},
            ],
          },
          '/api/water' => {'totalMl': 2000},
          _ => throw StateError('Unexpected path ${options.path}'),
        });
      });
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = adapter;
      final notifications = <String>[];

      await DailyGoalSummaryWorker.execute(
        _workerInput(),
        dioClient: dio,
        now: () => DateTime(2026, 10, 7, 21),
        showNotification: (body) async => notifications.add(body),
      );
      dio.close(force: true);

      expect(adapter.paths, ['/api/me', '/api/meals', '/api/water']);
      expect(notifications, hasLength(1));
      expect(notifications.single, contains('目標範圍內（1600/2000 kcal）'));
      expect(notifications.single, contains('已達個人目標（2000/2000 ml）'));
    },
  );

  test('does not post a summary when the account session expired', () async {
    final adapter = _FakeAdapter((options) => _jsonBody({}, statusCode: 401));
    final dio = Dio(
      BaseOptions(
        baseUrl: 'https://example.test',
        validateStatus: (status) => status != null && status < 600,
      ),
    )..httpClientAdapter = adapter;
    final notifications = <String>[];

    await DailyGoalSummaryWorker.execute(
      _workerInput(),
      dioClient: dio,
      now: () => DateTime(2026, 10, 7, 21),
      showNotification: (body) async => notifications.add(body),
    );
    dio.close(force: true);

    expect(notifications, isEmpty);
  });

  test('uses clearly marked same-day cached progress when offline', () async {
    final adapter = _FakeAdapter((_) => throw const SocketException('offline'));
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = adapter;
    final notifications = <String>[];
    final cached = const DailyGoalProgress(
      date: '2026-10-07',
      mealCount: 1,
      totalCalories: 1800,
      calorieTarget: 2000,
      waterTotalMl: 1000,
      waterGoalMl: 2000,
    );

    await DailyGoalSummaryWorker.execute(
      {..._workerInput(), 'cachedProgress': jsonEncode(cached.toJson())},
      dioClient: dio,
      now: () => DateTime(2026, 10, 7, 21),
      showNotification: (body) async => notifications.add(body),
    );
    dio.close(force: true);

    expect(notifications.single, contains('依上次同步的資料'));
    expect(notifications.single, contains('1800/2000 kcal'));
  });

  test('does not use prior-day cache for the current day', () async {
    final adapter = _FakeAdapter((_) => throw const SocketException('offline'));
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = adapter;
    final notifications = <String>[];
    const cached = DailyGoalProgress(
      date: '2026-10-06',
      mealCount: 1,
      totalCalories: 1800,
      calorieTarget: 2000,
      waterTotalMl: 1000,
      waterGoalMl: 2000,
    );

    await DailyGoalSummaryWorker.execute(
      {..._workerInput(), 'cachedProgress': jsonEncode(cached.toJson())},
      dioClient: dio,
      now: () => DateTime(2026, 10, 7, 21),
      showNotification: (body) async => notifications.add(body),
    );
    dio.close(force: true);

    expect(notifications.single, contains('目前無法更新今日進度'));
    expect(notifications.single, isNot(contains('1800/2000')));
  });
}

Map<String, dynamic> _workerInput() => {
  'baseUrl': 'https://example.test',
  'cookie': 'food_diary_session=example',
  'cachedProgress': '',
};

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final ResponseBody Function(RequestOptions options) handler;
  final List<String> paths = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonBody(Object data, {int statusCode = 200}) =>
    ResponseBody.fromString(
      jsonEncode(data),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
