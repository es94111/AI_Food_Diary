import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sentry_dio/sentry_dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'cache_service.dart';
import 'image_cache_service.dart';

/// Central HTTP client that mirrors the web app's cookie-session auth.
///
/// The Next.js backend authorises every food-diary endpoint via the
/// `food_diary_session` httpOnly cookie (`requireUser()`), so the mobile app
/// must capture that cookie on Google SSO and replay it on every request.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const String baseUrl = 'https://aifood.shao.one';
  static const _sessionKey = 'food_diary_session_cookie';
  static const _storage = FlutterSecureStorage();

  Dio? _dio;
  String? _sessionCookie;

  /// Number of requests currently awaiting a response, reported to Sentry as a
  /// gauge so we can see request concurrency over time.
  int _inFlight = 0;

  /// GET requests currently in flight, keyed by normalized `path?query`, so
  /// concurrent callers asking for the exact same resource share one network
  /// round trip instead of each firing their own request (e.g. several
  /// widgets independently reading `/api/meals` for the same day at once).
  ///
  /// This is deliberately separate from [CacheService]: the cache serves
  /// already-completed data (including across app restarts); this map only
  /// ever holds requests that are *currently* executing, and is emptied as
  /// soon as each one finishes (success or failure) — the next call after
  /// that always starts a fresh request, coalesced or not. GET-only; POST /
  /// PATCH / DELETE are never deduplicated since they can have side effects.
  final Map<String, Future<Response<dynamic>>> _inFlightGets = {};

  Future<Dio> _client() async {
    if (_dio != null) return _dio!;
    _sessionCookie ??= await _storage.read(key: _sessionKey);
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(
          minutes: 10,
        ), // match web OpenAI client (SDK default 10 min); AI analysis can be slow
        // Accept all HTTP statuses as normal responses so callers can read the
        // backend's {error} body (including 5xx) instead of a raw DioException.
        validateStatus: (status) => status != null && status < 600,
      ),
    );
    // Sentry: create an http.client span per request and inject distributed
    // tracing headers (gated by tracePropagationTargets) so requests join the
    // active transaction's trace and continue into the backend's server spans.
    dio.addSentry();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_sessionCookie != null) {
            options.headers['Cookie'] = _sessionCookie;
          }
          // Stamp the start time and bump the in-flight gauge so we can report
          // request latency + concurrency to Sentry once the request completes.
          options.extra['sentry_start'] = DateTime.now();
          _inFlight++;
          Sentry.metrics.gauge('api_in_flight_requests', _inFlight);
          handler.next(options);
        },
        onResponse: (response, handler) {
          _captureSessionCookie(response.headers.map['set-cookie']);
          _recordRequestMetrics(response.requestOptions);
          handler.next(response);
        },
        onError: (error, handler) {
          // Errors (timeouts, connection failures) skip onResponse, so close out
          // the metrics here too — otherwise the in-flight gauge leaks upward.
          _recordRequestMetrics(error.requestOptions);
          handler.next(error);
        },
      ),
    );
    _dio = dio;
    return dio;
  }

  /// Emits request latency (distribution) and in-flight count (gauge) to Sentry
  /// when a request finishes, whether it succeeded or errored.
  void _recordRequestMetrics(RequestOptions options) {
    final start = options.extra['sentry_start'];
    if (start is DateTime) {
      final ms = DateTime.now().difference(start).inMilliseconds;
      Sentry.metrics.distribution(
        'api_request_duration',
        ms,
        unit: SentryMetricUnit.millisecond,
        attributes: {'method': SentryAttribute.string(options.method)},
      );
    }
    if (_inFlight > 0) _inFlight--;
    Sentry.metrics.gauge('api_in_flight_requests', _inFlight);
  }

  void _captureSessionCookie(List<String>? setCookies) {
    if (setCookies == null) return;
    for (final raw in setCookies) {
      final first = raw.split(';').first.trim();
      if (first.startsWith('food_diary_session=')) {
        final value = first.substring('food_diary_session='.length);
        if (value.isEmpty) {
          // Logout clears the cookie.
          _sessionCookie = null;
          _storage.delete(key: _sessionKey);
        } else {
          _sessionCookie = first;
          _storage.write(key: _sessionKey, value: first);
        }
      }
    }
  }

  /// In-memory session cookie (e.g. `food_diary_session=<jwt>`), for cases
  /// like `Image.network` that need the header passed explicitly.
  String? get sessionCookie => _sessionCookie;

  Future<bool> hasSession() async {
    _sessionCookie ??= await _storage.read(key: _sessionKey);
    return _sessionCookie != null;
  }

  Future<void> clearSession() async {
    _sessionCookie = null;
    await _storage.delete(key: _sessionKey);
    // Drop any requests still in flight under the old session so a request
    // the next signed-in user makes for the same path+query can never join
    // (and be resolved by) a stale in-flight future started by the previous
    // account. The dropped requests themselves still complete for whoever
    // originally awaited them; they just stop being shared.
    _inFlightGets.clear();
    // Cached responses belong to the signed-out account; drop them so the
    // next sign-in never briefly shows stale data from a previous user.
    await CacheService.clearAll();
    // Same for cached images — the on-disk image cache is keyed only by URL,
    // so without clearing it the next account could load a previous user's
    // authenticated photos straight from disk.
    await ImageCacheService.clearAll();
  }

  /// Test-only: swaps in a pre-configured [Dio] (e.g. one wired to a fake
  /// [HttpClientAdapter]) so tests can exercise [get]'s coalescing/cache
  /// behavior without a real network or secure-storage-backed session lookup.
  @visibleForTesting
  void debugSetDioForTesting(Dio dio) {
    _dio = dio;
  }

  /// Test-only: resets all in-memory state between tests so [ApiClient.instance]
  /// (a singleton) doesn't leak in-flight requests or a session cookie across
  /// otherwise-independent test cases.
  @visibleForTesting
  void debugResetForTesting() {
    _dio = null;
    _sessionCookie = null;
    _inFlightGets.clear();
  }

  /// GET, optionally backed by a local cache (keyed on [path] + [query]).
  ///
  /// With `cache: true`, a successful response is written through to
  /// [CacheService] so a later call — even in a future app session — can read
  /// it back via [cached] to paint instantly instead of waiting on the
  /// network. If the request fails with a pure connectivity error (offline,
  /// DNS, timeout) and a cached copy exists, that cached copy is returned
  /// instead of throwing, so callers degrade gracefully rather than failing.
  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
    Map<String, String>? headers,
    bool cache = false,
  }) {
    // Every caller in this app authenticates via the cookie interceptor, so
    // nothing currently passes per-call headers — but a caller that does is
    // asking for something request-specific and must not be silently shared
    // with other callers, so skip coalescing rather than key on headers too.
    if (headers != null) {
      return _getUncoalesced(path, query: query, headers: headers, cache: cache);
    }
    final key = _cacheKey(path, query);
    final inFlight = _inFlightGets[key];
    if (inFlight != null) return inFlight;
    final future = _getUncoalesced(path, query: query, cache: cache);
    _inFlightGets[key] = future;
    // Only clear our own entry on completion — clearSession() or a same-key
    // request that started after us may already own (or have removed) this
    // key. Registered with an onError handler (rather than .whenComplete on a
    // dropped future) so this cleanup never surfaces as an unhandled error
    // for callers that already catch the returned [future] themselves.
    void clearIfCurrent([Object? _]) {
      if (identical(_inFlightGets[key], future)) _inFlightGets.remove(key);
    }
    future.then((_) => clearIfCurrent(), onError: clearIfCurrent);
    return future;
  }

  Future<Response<dynamic>> _getUncoalesced(
    String path, {
    Map<String, dynamic>? query,
    Map<String, String>? headers,
    bool cache = false,
  }) async {
    final dio = await _client();
    final cacheKey = cache ? _cacheKey(path, query) : null;
    try {
      final res = await dio.get(
        path,
        queryParameters: query,
        options: headers == null ? null : Options(headers: headers),
      );
      if (cacheKey != null && ok(res)) {
        await CacheService.write(cacheKey, res.data);
      }
      return res;
    } catch (e) {
      if (cacheKey != null && isConnectivityError(e)) {
        final cached = await CacheService.read(cacheKey);
        if (cached != null) {
          return Response<dynamic>(
            requestOptions: RequestOptions(path: path),
            statusCode: 200,
            data: cached,
          );
        }
      }
      rethrow;
    }
  }

  /// Last cached copy of a `cache: true` [get] response for [path] + [query],
  /// or null if nothing has been cached yet. Read-only — never hits the
  /// network — so callers can paint instantly on app start while the real
  /// [get] call refreshes in the background.
  Future<dynamic> cached(String path, {Map<String, dynamic>? query}) =>
      CacheService.read(_cacheKey(path, query));

  static String _cacheKey(String path, Map<String, dynamic>? query) {
    if (query == null || query.isEmpty) return path;
    final entries = query.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final qs = entries.map((e) => '${e.key}=${e.value}').join('&');
    return '$path?$qs';
  }

  /// GET returning raw bytes (e.g. an image), with the session cookie attached.
  Future<Response<List<int>>> getBytes(String path) async {
    final dio = await _client();
    return dio.get<List<int>>(
      path,
      options: Options(responseType: ResponseType.bytes),
    );
  }

  Future<Response<dynamic>> post(
    String path, {
    Object? data,
    Map<String, String>? headers,
  }) async {
    final dio = await _client();
    return dio.post(
      path,
      data: data,
      options: headers == null ? null : Options(headers: headers),
    );
  }

  Future<Response<dynamic>> patch(String path, {Object? data}) async {
    final dio = await _client();
    return dio.patch(path, data: data);
  }

  Future<Response<dynamic>> delete(String path) async {
    final dio = await _client();
    return dio.delete(path);
  }

  /// Extracts the backend's `{error}` message, falling back to [fallback].
  static String errorMessage(Response<dynamic> res, String fallback) {
    final data = res.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    return fallback;
  }

  static bool ok(Response<dynamic> res) {
    final code = res.statusCode ?? 0;
    return code >= 200 && code < 300;
  }

  /// Whether [error] is a pure network/connectivity failure (offline, DNS
  /// lookup failed, connection refused, or any timeout) rather than a real app
  /// bug. These are expected on mobile and shouldn't be surfaced as crashes or
  /// reported to Sentry as `fatal` noise.
  static bool isConnectivityError(Object? error) {
    if (error is SocketException) return true;
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionError:
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return true;
        default:
          return error.error is SocketException;
      }
    }
    return false;
  }
}

/// Thrown by services when an API call returns a non-2xx response.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.data});
  final String message;
  final int? statusCode;
  final Map<String, dynamic>? data;
  @override
  String toString() => message;
}
