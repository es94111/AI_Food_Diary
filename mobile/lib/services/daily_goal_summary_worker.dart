import 'package:dio/dio.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'daily_goal_summary.dart';

const dailyGoalSummaryTaskName = 'ai_food_daily_goal_summary';

/// Runs in the WorkManager isolate and creates a local, data-backed summary.
class DailyGoalSummaryWorker {
  static Future<bool> execute(
    Map<String, dynamic>? inputData, {
    Dio? dioClient,
    DateTime Function()? now,
    Future<void> Function(String body)? showNotification,
  }) async {
    if (inputData == null) return true;
    final cookie = inputData['cookie'];
    final baseUrl = inputData['baseUrl'];
    if (cookie is! String || cookie.isEmpty || baseUrl is! String) return true;

    final currentTime = (now ?? DateTime.now)();
    final date = _isoDate(currentTime);
    DailyGoalProgress? progress;
    var sessionExpired = false;
    try {
      final dio =
          dioClient ??
          Dio(
            BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 20),
              validateStatus: (status) => status != null && status < 600,
            ),
          );
      final query = {
        'date': date,
        'tzOffset': '${currentTime.timeZoneOffset.inMinutes}',
      };
      final responses = await Future.wait([
        dio.get<dynamic>('/api/me', options: _cookieOptions(cookie)),
        dio.get<dynamic>(
          '/api/meals',
          queryParameters: query,
          options: _cookieOptions(cookie),
        ),
        dio.get<dynamic>(
          '/api/water',
          queryParameters: query,
          options: _cookieOptions(cookie),
        ),
      ]);
      sessionExpired = responses.any(
        (response) => response.statusCode == 401 || response.statusCode == 403,
      );
      if (!sessionExpired && responses.every(_isSuccessful)) {
        progress = DailyGoalProgress.fromApiResponses(
          date: date,
          userResponse: _asMap(responses[0].data),
          mealsResponse: _asMap(responses[1].data),
          waterResponse: _asMap(responses[2].data),
        );
      }
    } catch (_) {
      // Use a same-day cache snapshot when the device is temporarily offline.
    }

    if (sessionExpired) return true;
    var usedCachedData = false;
    if (progress == null) {
      progress = DailyGoalProgress.fromCachedJson(
        inputData['cachedProgress'],
        currentDate: date,
      );
      usedCachedData = progress != null;
    }
    final body =
        progress?.notificationBody(fromCachedData: usedCachedData) ??
        '目前無法更新今日進度，打開 App 可查看最新紀錄。';
    try {
      await (showNotification ?? _showNotification)(body);
    } catch (_) {
      // A permission change during execution must not retry a stale summary.
    }
    return true;
  }

  static Options _cookieOptions(String cookie) =>
      Options(headers: {'Cookie': cookie});

  static bool _isSuccessful(Response<dynamic> response) {
    final status = response.statusCode ?? 0;
    return status >= 200 && status < 300;
  }

  static Map<String, dynamic> _asMap(Object? value) {
    if (value is! Map) throw const FormatException('Invalid API response.');
    return Map<String, dynamic>.from(value);
  }

  static Future<void> _showNotification(String body) async {
    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    await plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            dailyGoalSummaryChannelId,
            dailyGoalSummaryChannelName,
            description: '記錄、喝水與每日回顧提醒',
            importance: Importance.defaultImportance,
          ),
        );
    await plugin.show(
      id: dailyGoalSummaryNotificationId,
      title: '今日目標回顧',
      body: body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          dailyGoalSummaryChannelId,
          dailyGoalSummaryChannelName,
          channelDescription: '記錄、喝水與每日回顧提醒',
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
        ),
      ),
      payload: 'local_reminder:dailyReview',
    );
  }

  static String _isoDate(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}
