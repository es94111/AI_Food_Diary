// Regression coverage for ApiClient's GET single-flight coalescing, kept
// separate from the on-disk response cache it sits alongside. Uses a
// hand-rolled fake Dio [HttpClientAdapter] (no mocking package — matches this
// repo's existing test style) so these tests never touch the real network.
//
// `debugSetDioForTesting`/`debugResetForTesting` let these tests bypass
// ApiClient's normal Dio construction (which reads the session cookie from
// secure storage and installs the Sentry interceptor) — only `clearSession()`
// in the logout test still needs secure storage, which is mocked below via a
// minimal in-memory fake for its platform channel.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ai_food_mobile/services/api_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records every request handed to it and delegates the response to
/// [handler], so each test controls exactly what the "network" returns.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  int callCount = 0;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    callCount++;
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonBody(Object data, {int statusCode = 200}) {
  return ResponseBody.fromString(
    jsonEncode(data),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

Dio _dioWith(_FakeAdapter adapter) =>
    Dio(BaseOptions(baseUrl: ApiClient.baseUrl))..httpClientAdapter = adapter;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureStorageChannel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  const pathProviderChannel = MethodChannel('plugins.flutter.io/path_provider');
  late Map<String, String> secureStore;

  setUp(() {
    secureStore = {};
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (call) async {
      final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
      switch (call.method) {
        case 'write':
          secureStore[args['key'] as String] = args['value'] as String;
          return null;
        case 'read':
          return secureStore[args['key'] as String];
        case 'readAll':
          return Map<String, String>.from(secureStore);
        case 'delete':
          secureStore.remove(args['key'] as String);
          return null;
        case 'deleteAll':
          secureStore.clear();
          return null;
        case 'containsKey':
          return secureStore.containsKey(args['key'] as String);
        default:
          return null;
      }
    });
    // clearSession() also clears the on-disk image cache (flutter_cache_manager),
    // which lazily asks path_provider for a temp directory the first time it's
    // used — point it at a real OS temp dir so that (pre-existing, unrelated to
    // this change) code path doesn't throw MissingPluginException in tests.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(pathProviderChannel, (call) async {
      if (call.method == 'getTemporaryDirectory') {
        return Directory.systemTemp.path;
      }
      return null;
    });
    ApiClient.instance.debugResetForTesting();
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, null);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(pathProviderChannel, null);
    ApiClient.instance.debugResetForTesting();
  });

  test('10 concurrent identical GETs share exactly one HTTP call', () async {
    final adapter = _FakeAdapter((options) async {
      await Future<void>.delayed(const Duration(milliseconds: 5));
      return _jsonBody({'echo': options.uri.toString()});
    });
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    final futures = List.generate(
      10,
      (_) => ApiClient.instance
          .get('/api/meals', query: {'date': '2026-09-08', 'tzOffset': '480'}),
    );
    final results = await Future.wait(futures);

    expect(adapter.callCount, 1);
    for (final res in results) {
      expect(res.statusCode, 200);
      expect(res.data['echo'], contains('date=2026-09-08'));
    }
  });

  test('different query parameters are never coalesced', () async {
    final adapter = _FakeAdapter(
      (options) async => _jsonBody({'date': options.queryParameters['date']}),
    );
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    final results = await Future.wait([
      ApiClient.instance.get('/api/meals', query: {'date': '2026-09-07'}),
      ApiClient.instance.get('/api/meals', query: {'date': '2026-09-08'}),
    ]);

    expect(adapter.callCount, 2);
    expect(results[0].data['date'], '2026-09-07');
    expect(results[1].data['date'], '2026-09-08');
  });

  test('a failed GET is not stuck — the next call really retries', () async {
    var callCount = 0;
    final adapter = _FakeAdapter((options) async {
      callCount++;
      if (callCount == 1) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
        );
      }
      return _jsonBody({'ok': true});
    });
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    await expectLater(
      ApiClient.instance.get('/api/meals', query: {'date': '2026-09-08'}),
      throwsA(isA<DioException>()),
    );
    final res =
        await ApiClient.instance.get('/api/meals', query: {'date': '2026-09-08'});

    expect(res.data['ok'], true);
    expect(callCount, 2);
  });

  test('concurrent callers sharing a failing GET all receive the error, '
      'none crash', () async {
    final adapter = _FakeAdapter((options) async {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    });
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    final outcomes = await Future.wait(List.generate(
      5,
      (_) => ApiClient.instance
          .get('/api/meals', query: {'date': '2026-09-08'})
          .then<Object?>((r) => r)
          .catchError((Object e) => e),
    ));

    expect(adapter.callCount, 1);
    for (final outcome in outcomes) {
      expect(outcome, isA<DioException>());
    }
  });

  test('cache: true still writes through and cached() reads it back',
      () async {
    final adapter =
        _FakeAdapter((options) async => _jsonBody({'totalMl': 500}));
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    final res = await ApiClient.instance
        .get('/api/water', query: {'date': '2026-09-08'}, cache: true);
    expect(res.data['totalMl'], 500);

    final cached = await ApiClient.instance
        .cached('/api/water', query: {'date': '2026-09-08'});
    expect(cached, isNotNull);
    expect((cached as Map)['totalMl'], 500);
  });

  test('a connectivity error falls back to the cached copy instead of '
      'throwing', () async {
    var shouldFail = false;
    final adapter = _FakeAdapter((options) async {
      if (shouldFail) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        );
      }
      return _jsonBody({'totalMl': 750});
    });
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    await ApiClient.instance
        .get('/api/water', query: {'date': '2026-09-08'}, cache: true);

    shouldFail = true;
    final res = await ApiClient.instance
        .get('/api/water', query: {'date': '2026-09-08'}, cache: true);

    expect(res.statusCode, 200);
    expect(res.data['totalMl'], 750);
  });

  test('two POSTs are never deduplicated, even to the same path', () async {
    final adapter = _FakeAdapter((options) async => _jsonBody({'ok': true}));
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    await Future.wait([
      ApiClient.instance.post('/api/water', data: {'amountMl': 100}),
      ApiClient.instance.post('/api/water', data: {'amountMl': 100}),
    ]);

    expect(adapter.callCount, 2);
  });

  test(
      'clearSession clears in-flight GETs so a new session never reuses a '
      'stale future', () async {
    var callCount = 0;
    Completer<ResponseBody>? stale;
    final adapter = _FakeAdapter((options) async {
      callCount++;
      if (callCount == 1) {
        stale = Completer<ResponseBody>();
        return stale!.future;
      }
      return _jsonBody({'owner': 'user-b'});
    });
    ApiClient.instance.debugSetDioForTesting(_dioWith(adapter));

    // User A starts a GET that's still in flight at the moment of logout.
    final staleFuture =
        ApiClient.instance.get('/api/meals', query: {'date': '2026-09-08'});

    await ApiClient.instance.clearSession();

    // User B (post logout/login) requests the exact same resource. This must
    // NOT join user A's still-pending request.
    final fresh =
        await ApiClient.instance.get('/api/meals', query: {'date': '2026-09-08'});

    expect(callCount, 2);
    expect(fresh.data['owner'], 'user-b');

    // Let the stale request resolve so its original caller isn't left
    // hanging and nothing leaks into later tests.
    stale!.complete(_jsonBody({'owner': 'user-a'}));
    final staleResult = await staleFuture;
    expect(staleResult.data['owner'], 'user-a');
  });
}
