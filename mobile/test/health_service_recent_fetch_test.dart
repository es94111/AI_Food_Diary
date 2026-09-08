// Regression coverage for the health-sync duplicate-fetch fix: before this
// change, `_HealthSyncCardState._sync()` independently re-fetched the same
// N days of meals/water twice per sync tap (once via
// writeRecentMealsToHealth/writeRecentWaterToHealth to mirror into Health
// Connect, once via syncNow's internal _mealNutritionMetrics/
// _waterIntakeMetrics to build the cloud-upload payload) — doubling
// `/api/meals` and `/api/water` traffic. `fetchRecentMeals`/
// `fetchRecentWaterLogs` are the shared fetch now used by both call sites;
// this proves each issues exactly one HTTP request per day in range, capped
// at `HealthService.appDataMaxDays`, so a caller that fetches once and reuses
// the result (as `_sync()` now does) only pays for the fetch once.
import 'dart:convert';
import 'dart:typed_data';

import 'package:ai_food_mobile/services/api_client.dart';
import 'package:ai_food_mobile/services/health_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final ResponseBody Function(RequestOptions options) handler;
  int callCount = 0;
  final List<String> paths = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    callCount++;
    paths.add(options.path);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonBody(Object data) => ResponseBody.fromString(
      jsonEncode(data),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  setUp(() => ApiClient.instance.debugResetForTesting());
  tearDown(() => ApiClient.instance.debugResetForTesting());

  test('fetchRecentMeals issues exactly one /api/meals request per day',
      () async {
    final adapter = _FakeAdapter((options) => _jsonBody({
          'meals': [
            {'id': 'm-${options.queryParameters['date']}', 'totalCalories': 500},
          ],
        }));
    ApiClient.instance
        .debugSetDioForTesting(Dio(BaseOptions(baseUrl: ApiClient.baseUrl))
          ..httpClientAdapter = adapter);

    final meals = await HealthService.fetchRecentMeals(3);

    expect(adapter.callCount, 3);
    expect(adapter.paths.every((p) => p == '/api/meals'), isTrue);
    expect(meals.length, 3);
  });

  test('fetchRecentWaterLogs issues exactly one /api/water request per day',
      () async {
    final adapter = _FakeAdapter((options) => _jsonBody({
          'logs': [
            {
              'id': 'w-${options.queryParameters['date']}',
              'amountMl': 250,
              'drankAt': '2026-09-08T08:00:00Z',
            },
          ],
          'totalMl': 250,
        }));
    ApiClient.instance
        .debugSetDioForTesting(Dio(BaseOptions(baseUrl: ApiClient.baseUrl))
          ..httpClientAdapter = adapter);

    final logs = await HealthService.fetchRecentWaterLogs(4);

    expect(adapter.callCount, 4);
    expect(adapter.paths.every((p) => p == '/api/water'), isTrue);
    expect(logs.length, 4);
  });

  test('fetchRecentMeals caps the request count at appDataMaxDays', () async {
    final adapter = _FakeAdapter((options) => _jsonBody({'meals': []}));
    ApiClient.instance
        .debugSetDioForTesting(Dio(BaseOptions(baseUrl: ApiClient.baseUrl))
          ..httpClientAdapter = adapter);

    await HealthService.fetchRecentMeals(HealthService.appDataMaxDays + 20);

    expect(adapter.callCount, HealthService.appDataMaxDays);
  });
}
