import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sentry_dio/sentry_dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Central HTTP client that mirrors the web app's cookie-session auth.
///
/// The Next.js backend authorises every food-diary endpoint via the
/// `food_diary_session` httpOnly cookie (`requireUser()`), so the mobile app
/// must capture that cookie on login/register and replay it on every request.
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

  Future<Dio> _client() async {
    if (_dio != null) return _dio!;
    _sessionCookie ??= await _storage.read(key: _sessionKey);
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(minutes: 10), // match web OpenAI client (SDK default 10 min); AI analysis can be slow
      // Accept all HTTP statuses as normal responses so callers can read the
      // backend's {error} body (including 5xx) instead of a raw DioException.
      validateStatus: (status) => status != null && status < 600,
    ));
    // Sentry: create an http.client span per request and inject distributed
    // tracing headers (gated by tracePropagationTargets) so requests join the
    // active transaction's trace and continue into the backend's server spans.
    dio.addSentry();
    dio.interceptors.add(InterceptorsWrapper(
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
    ));
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
  }

  Future<Response<dynamic>> get(String path,
      {Map<String, dynamic>? query, Map<String, String>? headers}) async {
    final dio = await _client();
    return dio.get(path,
        queryParameters: query,
        options: headers == null ? null : Options(headers: headers));
  }

  /// GET returning raw bytes (e.g. an image), with the session cookie attached.
  Future<Response<List<int>>> getBytes(String path) async {
    final dio = await _client();
    return dio.get<List<int>>(path,
        options: Options(responseType: ResponseType.bytes));
  }

  Future<Response<dynamic>> post(String path,
      {Object? data, Map<String, String>? headers}) async {
    final dio = await _client();
    return dio.post(path,
        data: data, options: headers == null ? null : Options(headers: headers));
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
}

/// Thrown by services when an API call returns a non-2xx response.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}
