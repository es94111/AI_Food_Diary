import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:path_provider/path_provider.dart';
import 'package:workmanager/workmanager.dart';
import 'package:dio/dio.dart';

import 'api_client.dart';

/// Runs the meal AI analysis in a WorkManager background isolate so it keeps
/// going when the app is minimised or killed, and posts a system notification
/// when it finishes. The big inputs (images) are handed to the isolate via a
/// file on disk; only small strings (file paths, the session cookie, the base
/// URL) go through WorkManager's tiny inputData channel. The result is written
/// back to another file that the foreground app polls (see [pollResult]).
///
/// Android only — iOS falls back to the in-app foreground analysis.
class BackgroundAnalysis {
  static const taskName = 'ai_food_meal_analysis';
  static const _channelId = 'meal_analysis';
  static const _channelName = '餐點 AI 分析';
  static const _progressNotifId = 1900;
  static const _doneNotifId = 1901;
  static const _requestFileName = 'bg_meal_request.json';
  static const _resultFileName = 'bg_meal_result.json';

  static bool get supported => !kIsWeb && Platform.isAndroid;

  /// One-time setup from main(): register the WorkManager dispatcher, set up the
  /// notification channel, and ask for the Android 13+ notification permission.
  static Future<void> init() async {
    if (!supported) return;
    await Workmanager().initialize(analysisCallbackDispatcher);
    await _ensureNotifications();
    await FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  }

  /// Enqueues a background analysis. [body] is the exact POST body for the
  /// endpoint chosen by [mode] ('photo' | 'describe' | 'manual'). The save
  /// context (mealType/images/description) is stored too so it can be recovered
  /// if the app is killed and reopened from the completion notification.
  static Future<void> enqueue({
    required String mode,
    required String mealType,
    required List<String> imageDataUrls,
    required String description,
    required Map<String, dynamic> body,
  }) async {
    final dir = (await getApplicationSupportDirectory()).path;
    final requestPath = '$dir/$_requestFileName';
    final resultPath = '$dir/$_resultFileName';
    // Clear any stale result from a previous run before starting.
    await _deleteQuietly(resultPath);
    await File(requestPath).writeAsString(jsonEncode({
      'mode': mode,
      'mealType': mealType,
      'imageDataUrls': imageDataUrls,
      'description': description,
      'body': body,
    }));

    // Make sure the in-memory session cookie is loaded, then hand it to the
    // isolate (it can't read flutter_secure_storage as reliably as we can here).
    await ApiClient.instance.hasSession();
    final cookie = ApiClient.instance.sessionCookie ?? '';

    await Workmanager().registerOneOffTask(
      taskName,
      taskName,
      inputData: {
        'requestPath': requestPath,
        'resultPath': resultPath,
        'cookie': cookie,
        'baseUrl': ApiClient.baseUrl,
      },
      existingWorkPolicy: ExistingWorkPolicy.replace,
      constraints: Constraints(networkType: NetworkType.connected),
    );
    await _showProgressNotification();
  }

  /// Reads and consumes the background result, or null if not ready. Shape:
  /// `{status: 'done'|'error', foods: [...], error: '...'}`.
  static Future<Map<String, dynamic>?> pollResult() async {
    if (!supported) return null;
    try {
      final dir = (await getApplicationSupportDirectory()).path;
      final file = File('$dir/$_resultFileName');
      if (!await file.exists()) return null;
      final data = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      await _deleteQuietly(file.path);
      return data;
    } catch (_) {
      return null;
    }
  }

  static Future<void> cancel() async {
    if (!supported) return;
    await Workmanager().cancelByUniqueName(taskName);
    await clearNotifications();
  }

  static Future<void> clearNotifications() async {
    if (!supported) return;
    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.cancel(id: _progressNotifId);
    await plugin.cancel(id: _doneNotifId);
  }

  /// The saved context for an in-flight/finished job ({mode, mealType,
  /// imageDataUrls, description}), or null if there's no pending request file.
  static Future<Map<String, dynamic>?> readContext() async {
    if (!supported) return null;
    try {
      final dir = (await getApplicationSupportDirectory()).path;
      final file = File('$dir/$_requestFileName');
      if (!await file.exists()) return null;
      return jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// How long ago the pending request file was written, or null if none.
  static Future<Duration?> pendingRequestAge() async {
    if (!supported) return null;
    try {
      final dir = (await getApplicationSupportDirectory()).path;
      final file = File('$dir/$_requestFileName');
      if (!await file.exists()) return null;
      return DateTime.now().difference((await file.stat()).modified);
    } catch (_) {
      return null;
    }
  }

  /// Removes the request + result files once a job has been consumed.
  static Future<void> clearJobFiles() async {
    if (!supported) return;
    final dir = (await getApplicationSupportDirectory()).path;
    await _deleteQuietly('$dir/$_requestFileName');
    await _deleteQuietly('$dir/$_resultFileName');
  }

  // ---- notifications (used from both isolates) ----

  static Future<void> _ensureNotifications() async {
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await FlutterLocalNotificationsPlugin().initialize(settings: settings);
    await FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(const AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: '餐點 AI 分析進度與結果',
      importance: Importance.high,
    ));
  }

  static Future<void> _showProgressNotification() async {
    await _ensureNotifications();
    await FlutterLocalNotificationsPlugin().show(
      id: _progressNotifId,
      title: 'AI 正在分析餐點…',
      body: '完成後會通知你，可以先離開或關閉 App。',
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          ongoing: true,
          autoCancel: false,
          showProgress: true,
          indeterminate: true,
          importance: Importance.low,
          priority: Priority.low,
          onlyAlertOnce: true,
        ),
      ),
    );
  }

  /// Replaces the progress notification with the finished result. Called from
  /// the background isolate.
  static Future<void> showResultNotification(
      {required bool done, String? error}) async {
    await _ensureNotifications();
    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.cancel(id: _progressNotifId);
    await plugin.show(
      id: _doneNotifId,
      title: done ? 'AI 分析完成 ✅' : 'AI 分析失敗',
      body: done ? '點此回到 App 確認並儲存餐點。' : (error ?? '請回到 App 重試。'),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }

  static Future<void> _deleteQuietly(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }
}

/// WorkManager background-isolate entry point. Runs the analysis HTTP call with
/// raw Dio (pure Dart, no platform plugins needed), writes the result to the
/// agreed file, and fires the completion notification.
@pragma('vm:entry-point')
void analysisCallbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task != BackgroundAnalysis.taskName || inputData == null) {
      return true;
    }
    final requestPath = inputData['requestPath'] as String?;
    final resultPath = inputData['resultPath'] as String?;
    final cookie = inputData['cookie'] as String?;
    final baseUrl = inputData['baseUrl'] as String?;
    if (requestPath == null || resultPath == null || baseUrl == null) {
      return true;
    }

    Future<void> writeResult(Map<String, dynamic> data) async {
      try {
        await File(resultPath).writeAsString(jsonEncode(data));
      } catch (_) {}
    }

    try {
      final req = jsonDecode(await File(requestPath).readAsString())
          as Map<String, dynamic>;
      final mode = req['mode'] as String;
      final body = req['body'] as Map<String, dynamic>;
      final path = switch (mode) {
        'photo' => '/api/meals/analyze',
        'describe' => '/api/meals/analyze-description',
        _ => '/api/meals/analyze-manual',
      };

      final dio = Dio(BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(minutes: 10),
        validateStatus: (status) => status != null && status < 600,
      ));
      final res = await dio.post(
        path,
        data: body,
        options: Options(
            headers: (cookie != null && cookie.isNotEmpty)
                ? {'Cookie': cookie}
                : null),
      );

      final code = res.statusCode ?? 0;
      if (code >= 200 && code < 300) {
        final dataMap = res.data is Map ? res.data as Map : const {};
        final analysis = dataMap['analysis'];
        final foods =
            (analysis is Map ? analysis['foods'] : null) as List? ?? const [];
        await writeResult({'status': 'done', 'foods': foods});
        await BackgroundAnalysis.showResultNotification(done: true);
      } else {
        final error = (res.data is Map && res.data['error'] is String)
            ? res.data['error'] as String
            : 'AI 分析失敗（$code）';
        await writeResult({'status': 'error', 'error': error});
        await BackgroundAnalysis.showResultNotification(
            done: false, error: error);
      }
    } catch (e) {
      await writeResult({'status': 'error', 'error': e.toString()});
      await BackgroundAnalysis.showResultNotification(
          done: false, error: e.toString());
    }
    return true;
  });
}
